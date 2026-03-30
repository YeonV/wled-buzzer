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
  { id: 'BB0001', name: 'Herz'    },
  { id: 'BB0002', name: 'Pik' },
  { id: 'BB0003', name: 'Karo' },
  { id: 'BB0004', name: 'Kreuz' },
];

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

test.describe('Setup Screen Flow', () => {
  let buzzerList = [];

  test.beforeAll(async () => {
    if (!fs.existsSync('videos')) fs.mkdirSync('videos');
    if (!fs.existsSync('videos/raw')) fs.mkdirSync('videos/raw', { recursive: true });
    if (fs.existsSync('videos/example.txt')) {
        try { fs.unlinkSync('videos/example.txt'); } catch(e) {}
    }

    await serverManager.start();
    // Brief settle time
    await new Promise(r => setTimeout(r, 2000));

    buzzerList = BUZZERS.map(b => new BuzzerMock(b.id, testConfig.ports.mqtt));
    await Promise.all(buzzerList.map(b => b.connect()));
  });

  test.afterAll(async () => {
    await Promise.all(buzzerList.map(b => b.disconnect()));
    await serverManager.stop();
  });

  test('Quiz flow with moderator and display', async ({ browser }) => {
    const displayContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: 'videos/raw/', size: { width: 1280, height: 720 } }
    });
    const moderatorContext = await browser.newContext({
      viewport: { width: 360, height: 800 },
      recordVideo: { dir: 'videos/raw/', size: { width: 360, height: 800 } },
      isMobile: true
    });

    const displayPage = await displayContext.newPage();
    const moderatorPage = await moderatorContext.newPage();

    // Inject audio capture into display page before navigation
    await displayPage.addInitScript(() => {
        window.__audioChunks = [];
        window.__audioCtx = null;
        window.__audioDest = null;

        // Called once on first user gesture to create and start the recorder
        window.__initAudioCapture = function() {
            if (window.__audioCtx) return;
            const ctx = new AudioContext();
            ctx.resume();
            const dest = ctx.createMediaStreamDestination();

            // Keep a silent oscillator connected so MediaRecorder emits continuous
            // chunks from t=0 even before any real sound plays — without this the
            // first chunk timestamp equals the first sound event, shifting audio early.
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

    // 1. Open both pages
    await displayPage.goto('/');
    await moderatorPage.goto('/?view=moderator');
    // await injectCursor(displayPage);
    await injectCursor(moderatorPage);

    // Click the display page to unlock AudioContext (requires user gesture)
    await displayPage.click('body');
    await displayPage.evaluate(() => window.__initAudioCapture());

    await moderatorPage.waitForTimeout(1000);

    // 2. Setup Screen / Identification
    await test.step('Buzzer Identification & Start Game', async () => {
        await moderatorPage.waitForSelector('.setup-screen', { timeout: 15000 });

        // Press all buzzers until all 4 rows exist and all are active (setup-active class).
        // Rows can appear early via mqttClientIpMap (active:false), so we wait for the
        // active count to match before proceeding.
        await expect(async () => {
            for (const bz of buzzerList) await bz.press();

            const total = await moderatorPage.locator('tr.setup-row').count();
            if (total < BUZZERS.length) throw new Error(`Only ${total}/${BUZZERS.length} rows visible`);

            const active = await moderatorPage.locator('tr.setup-row.setup-active').count();
            if (active < BUZZERS.length) throw new Error(`Only ${active}/${BUZZERS.length} buzzers active`);
        }).toPass({ intervals: [2000], timeout: 30000 });

        // Fill names in insertion order (rows appear in MQTT connect order: BB0001…BB0004)
        const rows = moderatorPage.locator('tr.setup-row');
        for (let i = 0; i < BUZZERS.length; i++) {
            await rows.nth(i).locator('input.setup-name-input').fill(BUZZERS[i].name);
            await moderatorPage.waitForTimeout(300);
        }

        // UI Driven: Click Start Game button
        const startBtn = moderatorPage.locator('.setup-start-btn');
        await startBtn.click({ force: true });
        await moderatorPage.waitForTimeout(2000);
    });

    await test.step('Verify Game Transition', async () => {
        // Moderator view should show scoreboard
        await expect(moderatorPage.locator('.scoreboard')).toBeVisible({ timeout: 15000 });
        await moderatorPage.waitForTimeout(1000);
    });


    // Save display page audio recording
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

    const displayVideoPath = await displayPage.video().path();
    const moderatorVideoPath = await moderatorPage.video().path();

    await displayContext.close();
    await moderatorContext.close();

    // Store paths for merging
    fs.appendFileSync('videos/example.txt', `${displayVideoPath}\n${moderatorVideoPath}\n${displayAudioPath || ''}\n`);

    // Attempt merge, then clean up raw files
    try {
        execSync('node tests/merge-videos.js videos/example.txt', { stdio: 'inherit' });
        try { fs.rmSync('videos/raw', { recursive: true, force: true }); } catch(e) {}
        try { fs.unlinkSync('videos/example.txt'); } catch(e) {}
    } catch(e) {}
  });
});
