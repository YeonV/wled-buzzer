const { test, expect } = require('@playwright/test');
const ServerManager = require('./server-manager');
const BuzzerMock = require('./buzzer-mock');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const configPath = path.join(__dirname, 'test-config.json');
const testConfig = require(configPath);
const serverManager = new ServerManager(configPath);

const BUZZERS = [
  { id: 'BB0001', name: 'Blade'   },
  { id: 'BB0002', name: 'Leon'    },
  { id: 'BB0003', name: 'Lorain'  },
  { id: 'BB0004', name: 'Fabio'   },
  { id: 'BB0005', name: 'Saida'   },
  { id: 'BB0006', name: 'Bastian' },
  { id: 'BB0007', name: 'Andreas' },
  { id: 'BB0009', name: 'Zoe'     },
  { id: 'BB0008', name: 'Johanna' },
];

// Extra pause after UI interactions
const waitHuman = 300;

/** Inject a visible cursor overlay into a page so clicks appear in recordings. */
async function injectCursor(page) {
  await page.addStyleTag({ content: `
    #pw-cursor {
      position: fixed;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(255, 60, 60, 0.75);
      border: 2.5px solid #fff;
      box-shadow: 0 0 0 1.5px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.35);
      pointer-events: none;
      z-index: 2147483647;
      transform: translate(-50%, -50%);
      transition: width 0.08s, height 0.08s, background 0.08s;
    }
    #pw-cursor.pw-click {
      width: 14px;
      height: 14px;
      background: rgba(255, 210, 0, 0.9);
    }
  ` });
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.id = 'pw-cursor';
    document.body.appendChild(el);
    document.addEventListener('mousemove', e => {
      el.style.left = e.clientX + 'px';
      el.style.top  = e.clientY + 'px';
    }, { passive: true });
    document.addEventListener('mousedown', () => el.classList.add('pw-click'));
    document.addEventListener('mouseup',   () => el.classList.remove('pw-click'));
  });
}

test.describe('Combined: Setup + Game + Settings (9 players)', () => {
  let buzzerList = [];

  test.beforeAll(async () => {
    if (!fs.existsSync('videos')) fs.mkdirSync('videos');
    if (!fs.existsSync('videos/raw')) fs.mkdirSync('videos/raw', { recursive: true });
    if (fs.existsSync('videos/combined.txt')) {
        try { fs.unlinkSync('videos/combined.txt'); } catch(e) {}
    }

    await serverManager.start();
    await new Promise(r => setTimeout(r, 2000));

    // Activate custom pack if configured via env var
    const avatarPack = process.env.TEST_AVATAR_PACK;
    const questionPack = process.env.TEST_QUESTION_PACK;
    if (avatarPack || questionPack) {
      const body = {};
      if (avatarPack) body.avatars = avatarPack;
      if (questionPack) body.questions = questionPack;
      await fetch(`http://localhost:${testConfig.ports.ws}/api/packs/activate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    buzzerList = BUZZERS.map(b => new BuzzerMock(b.id, testConfig.ports.mqtt));
    await Promise.all(buzzerList.map(b => b.connect()));
  });

  test.afterAll(async () => {
    await Promise.all(buzzerList.map(b => b.disconnect()));
    await serverManager.stop();
  });

  test('Setup with 9 players, start game, open settings', async ({ browser }) => {
    // ── 3 browser contexts: display, moderator, scoreboard ──
    const displayContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: { dir: 'videos/raw/', size: { width: 1920, height: 1080 } }
    });
    const moderatorContext = await browser.newContext({
      viewport: { width: 360, height: 800 },
      recordVideo: { dir: 'videos/raw/', size: { width: 360, height: 800 } },
      isMobile: true
    });
    const scoreboardContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: { dir: 'videos/raw/', size: { width: 1920, height: 1080 } }
    });

    const displayPage    = await displayContext.newPage();
    const moderatorPage  = await moderatorContext.newPage();
    const scoreboardPage = await scoreboardContext.newPage();

    // Inject audio capture into display page before navigation
    await displayPage.addInitScript(() => {
        window.__audioChunks = [];
        window.__audioCtx = null;
        window.__audioDest = null;

        window.__initAudioCapture = function() {
            if (window.__audioCtx) return;
            const ctx = new AudioContext();
            ctx.resume();
            const dest = ctx.createMediaStreamDestination();
            const silence = ctx.createGain();
            silence.gain.value = 0;
            const osc = ctx.createOscillator();
            osc.connect(silence);
            silence.connect(dest);
            osc.start();
            const rec = new MediaRecorder(dest.stream);
            rec.ondataavailable = e => { if (e.data.size > 0) window.__audioChunks.push(e.data); };
            rec.start(100);
            window.__audioCtx = ctx;
            window.__audioDest = dest;
            window.__mediaRecorder = rec;
        };

        const OrigAudio = window.Audio;
        window.Audio = function(url) {
            const el = new OrigAudio(url);
            el.addEventListener('play', () => {
                try {
                    if (!window.__audioCtx) return;
                    window.__audioCtx.resume();
                    const node = window.__audioCtx.createMediaElementSource(el);
                    node.connect(window.__audioDest);
                    node.connect(window.__audioCtx.destination);
                } catch(e) {}
            }, { once: true });
            return el;
        };
        window.Audio.prototype = OrigAudio.prototype;
    });

    // 1. Open all three pages
    await displayPage.goto('/');
    await moderatorPage.goto('/?view=moderator');
    await scoreboardPage.goto('/?view=scoreboard');
    await injectCursor(moderatorPage);

    // Unlock audio on display
    await displayPage.click('body');
    await displayPage.evaluate(() => window.__initAudioCapture());

    await moderatorPage.waitForTimeout(1000);

    // ── SETUP PHASE (from setup-scoreboard) ──

    await test.step('Wait for Setup Screen', async () => {
        await moderatorPage.waitForSelector('.setup-screen', { timeout: 15000 });
        await moderatorPage.waitForTimeout(waitHuman);
    });

    await test.step('Identify all 9 Buzzers', async () => {
        await expect(async () => {
            for (const bz of buzzerList) await bz.press();

            const total = await moderatorPage.locator('tr.setup-row').count();
            if (total < BUZZERS.length) throw new Error(`Only ${total}/${BUZZERS.length} rows visible`);

            const active = await moderatorPage.locator('tr.setup-row.setup-active').count();
            if (active < BUZZERS.length) throw new Error(`Only ${active}/${BUZZERS.length} buzzers active`);
        }).toPass({ intervals: [2000], timeout: 30000 });
        await moderatorPage.waitForTimeout(waitHuman);
    });

    await test.step('Fill Buzzer Names', async () => {
        const rows = moderatorPage.locator('tr.setup-row');
        for (let i = 0; i < BUZZERS.length; i++) {
            await rows.nth(i).locator('input.setup-name-input').fill(BUZZERS[i].name);
            await moderatorPage.waitForTimeout(waitHuman);
        }
    });

    await test.step('Enable Individual Color for all players', async () => {
        const rows = moderatorPage.locator('tr.setup-row');
        const toggleLabels = BUZZERS.map((_, i) => rows.nth(i).locator('label.setup-color-toggle'));
        const colorPickers = BUZZERS.map((_, i) => rows.nth(i).locator('input.setup-color-picker'));

        for (let i = 0; i < BUZZERS.length; i++) {
            await toggleLabels[i].click();
            await expect(colorPickers[i]).toBeVisible({ timeout: 3000 });
            await moderatorPage.waitForTimeout(waitHuman);
        }
        await moderatorPage.waitForTimeout(waitHuman);
    });

    await test.step('Start Game', async () => {
        await moderatorPage.waitForTimeout(waitHuman);
        const startBtn = moderatorPage.locator('.setup-start-btn');
        await startBtn.click({ force: true });
        await moderatorPage.waitForTimeout(waitHuman * 3);
    });

    await test.step('Verify Game Transition on all views', async () => {
        await expect(moderatorPage.locator('.scoreboard')).toBeVisible({ timeout: 15000 });
        await expect(scoreboardPage.locator('.scoreboard, .sb-blade')).toBeVisible({ timeout: 15000 });
        await expect(displayPage.locator('.display-setup')).not.toBeVisible({ timeout: 15000 });
        await moderatorPage.waitForTimeout(waitHuman * 5);
    });

    // ── SETTINGS PHASE ──

    await test.step('Wait for presets ready', async () => {
        // top-bar loses the --loading class once presetsReady fires
        // 9 mock buzzers × 4 presets × 600ms delay ≈ 22s
        await expect(moderatorPage.locator('.top-bar')).not.toHaveClass(/top-bar--loading/, { timeout: 60000 });
        await moderatorPage.waitForTimeout(waitHuman);
    });

    await test.step('Navigate forward and back to fix top-bar layout', async () => {
        // Navigating to slide 2 and back forces a re-render that makes the
        // sticky top-bar reliably visible on the mobile viewport
        const navNext = moderatorPage.locator('.question-nav .btn').last();
        const navPrev = moderatorPage.locator('.question-nav .btn').first();
        await navNext.click({ force: true });
        await moderatorPage.waitForTimeout(800);
        await navPrev.click({ force: true });
        await moderatorPage.waitForTimeout(800);
    });

    await test.step('Open Settings on moderator', async () => {
        await moderatorPage.evaluate(() => window.scrollTo(0, 0));
        await moderatorPage.waitForTimeout(300);
        const settingsBtn = moderatorPage.locator('button[title="Edit player names"]');
        await expect(settingsBtn).toBeVisible({ timeout: 5000 });
        await settingsBtn.dispatchEvent('click');
        await expect(moderatorPage.locator('.settings-panel')).toBeVisible({ timeout: 5000 });
        await moderatorPage.waitForTimeout(waitHuman);
    });

    await test.step('Enable Active-Only toggle and Blade variant', async () => {
        // Settings panel on 360×800 overflows — use evaluate for reliable interaction
        await moderatorPage.evaluate(() => {
            // Toggle active-only checkbox
            const toggle = document.querySelector('.settings-panel .outlined-toggle input[type="checkbox"]');
            if (toggle && !toggle.checked) {
                toggle.click();
            }
            // Change scoreboard variant to blade
            const sel = document.querySelector('.settings-panel select option[value="blade"]')?.closest('select');
            if (sel) {
                sel.value = 'blade';
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        await moderatorPage.waitForTimeout(waitHuman);
    });

    await test.step('Save settings', async () => {
        const saveBtn = moderatorPage.locator('.settings-actions .btn--success');
        await saveBtn.dispatchEvent('click');
        await moderatorPage.waitForTimeout(5000);
    });

    // ── SAVE RECORDINGS ──

    const audioDataUrl = await displayPage.evaluate(() => new Promise(resolve => {
        if (!window.__mediaRecorder || window.__audioChunks.length === 0) { resolve(null); return; }
        const finish = () => {
            const blob = new Blob(window.__audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(blob);
        };
        if (window.__mediaRecorder.state !== 'inactive') {
            window.__mediaRecorder.onstop = finish;
            window.__mediaRecorder.stop();
        } else {
            finish();
        }
    }));
    let displayAudioPath = null;
    if (audioDataUrl) {
        displayAudioPath = 'videos/raw/display-audio.webm';
        fs.writeFileSync(displayAudioPath, Buffer.from(audioDataUrl.split(',')[1], 'base64'));
        console.log('Display audio saved:', displayAudioPath);
    }

    const displayVideoPath    = await displayPage.video().path();
    const moderatorVideoPath  = await moderatorPage.video().path();
    const scoreboardVideoPath = await scoreboardPage.video().path();

    await displayContext.close();
    await moderatorContext.close();
    await scoreboardContext.close();

    // Store paths for merging (3 videos + audio)
    fs.appendFileSync('videos/combined.txt', `${displayVideoPath}\n${moderatorVideoPath}\n${scoreboardVideoPath}\n${displayAudioPath || ''}\n`);

    // Attempt merge, then clean up raw files
    try {
        execSync('node tests/merge-videos.js videos/combined.txt', { stdio: 'inherit' });
        try { fs.rmSync('videos/raw', { recursive: true, force: true }); } catch(e) {}
        try { fs.unlinkSync('videos/combined.txt'); } catch(e) {}
    } catch(e) {}
  });
});
