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

// Extra pause after UI interactions — increase for slower recordings or human review
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

test.describe('Setup Screen Flow', () => {
  let buzzerList = [];

  test.beforeAll(async () => {
    if (!fs.existsSync('videos')) fs.mkdirSync('videos');
    if (!fs.existsSync('videos/raw')) fs.mkdirSync('videos/raw', { recursive: true });
    if (fs.existsSync('videos/setup.txt')) {
        try { fs.unlinkSync('videos/setup.txt'); } catch(e) {}
    }

    await serverManager.start();
    // Brief settle time
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
    await test.step('Wait for Setup Screen', async () => {
        await moderatorPage.waitForSelector('.setup-screen', { timeout: 15000 });
    });

    await test.step('Identify Buzzers', async () => {
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
    });

    await test.step('Fill Buzzer Names', async () => {
        // Fill names in insertion order (rows appear in MQTT connect order: BB0001…BB0004)
        const rows = moderatorPage.locator('tr.setup-row');
        for (let i = 0; i < BUZZERS.length; i++) {
            await rows.nth(i).locator('input.setup-name-input').fill(BUZZERS[i].name);
            await moderatorPage.waitForTimeout(waitHuman);
        }
    });

    await test.step('Active Toggle — stress all 4 buzzers', async () => {
        const rows = moderatorPage.locator('tr.setup-row');

        // Trigger a WLED scan before toggling so any unresolved IPs get picked up
        const scanBtn = moderatorPage.locator('button.btn--hover--info[aria-pressed]');
        await scanBtn.click();
        await moderatorPage.waitForTimeout(3000);

        // Build locators for each buzzer's moderator checkbox and display cluster
        const checkboxes = BUZZERS.map((_, i) =>
            rows.nth(i).locator('td').first().locator('input[type="checkbox"]')
        );
        const displayClusters = BUZZERS.map(b =>
            displayPage
                .locator('.display-setup__stage > .buzzer-cluster')
                .filter({ has: displayPage.locator(`.buzzer-label:has-text("${b.name}")`) })
        );

        // Phase 1 — uncheck all buzzers one by one
        for (let i = 0; i < BUZZERS.length; i++) {
            await checkboxes[i].uncheck();
            await expect(rows.nth(i)).not.toHaveClass(/setup-active/);
            await expect(displayClusters[i]).toHaveCSS('opacity', '0.25', { timeout: 5000 });
            await moderatorPage.waitForTimeout(waitHuman / 3);
        }

        // Phase 2 — check all buzzers one by one
        for (let i = 0; i < BUZZERS.length; i++) {
            await checkboxes[i].check();
            await expect(rows.nth(i)).toHaveClass(/setup-active/);
            await expect(displayClusters[i]).toHaveCSS('opacity', '1', { timeout: 5000 });
            await moderatorPage.waitForTimeout(waitHuman / 3);
        }

        // Phase 3 — uncheck then re-check each buzzer individually
        for (let i = 0; i < BUZZERS.length; i++) {
            await checkboxes[i].uncheck();
            await expect(rows.nth(i)).not.toHaveClass(/setup-active/);
            await expect(displayClusters[i]).toHaveCSS('opacity', '0.25', { timeout: 5000 });
            await moderatorPage.waitForTimeout(waitHuman / 3);

            await checkboxes[i].check();
            await expect(rows.nth(i)).toHaveClass(/setup-active/);
            await expect(displayClusters[i]).toHaveCSS('opacity', '1', { timeout: 5000 });
            await moderatorPage.waitForTimeout(waitHuman / 3);
        }
    });

    await test.step('Buzzer Press Flash — indicator on moderator & display', async () => {
        const row0 = moderatorPage.locator('tr.setup-row').nth(0);
        const displayCluster = displayPage
            .locator('.display-setup__stage > .buzzer-cluster')
            .filter({ has: displayPage.locator(`.buzzer-label:has-text("${BUZZERS[0].name}")`) });

        // Small settle after toggle stress, then press and check flash
        await moderatorPage.waitForTimeout(500);
        await buzzerList[0].press();
        await expect(row0).toHaveClass(/setup-buzzing/, { timeout: 3000 });

        // Display: the icon dot gets the --on modifier
        await expect(displayCluster.locator('.buzzer-list-icon--on')).toBeVisible({ timeout: 5000 });
        await moderatorPage.waitForTimeout(waitHuman);

        // Flash auto-clears after ~1.5 s (server-side timeout)
        await expect(displayCluster.locator('.buzzer-list-icon--on')).not.toBeVisible({ timeout: 5000 });
    });

    await test.step('Individual Color — toggle on, recolor, toggle off all 4', async () => {
        const rows = moderatorPage.locator('tr.setup-row');

        // One distinct color per buzzer
        const COLORS = ['#ff0000', '#00aaff', '#00cc44', '#ff8800'];

        const toggleLabels = BUZZERS.map((_, i) => rows.nth(i).locator('label.setup-color-toggle'));
        const colorPickers = BUZZERS.map((_, i) => rows.nth(i).locator('input.setup-color-picker'));

        // Phase 1 — enable individual color for each buzzer iteratively
        for (let i = 0; i < BUZZERS.length; i++) {
            await toggleLabels[i].click();
            await expect(colorPickers[i]).toBeVisible({ timeout: 3000 });
            await moderatorPage.waitForTimeout(waitHuman);
        }

        // Phase 2 — set a distinct color for each buzzer iteratively
        for (let i = 0; i < BUZZERS.length; i++) {
            await colorPickers[i].fill(COLORS[i]);
            await expect(colorPickers[i]).toHaveValue(COLORS[i]);
            await moderatorPage.waitForTimeout(waitHuman);
        }

        // Phase 3 — disable individual color for each buzzer iteratively
        for (let i = 0; i < BUZZERS.length; i++) {
            await toggleLabels[i].click();
            await expect(colorPickers[i]).not.toBeVisible({ timeout: 3000 });
            await moderatorPage.waitForTimeout(waitHuman);
        }
    });

    await test.step('Avatar Icon — pick via icon picker', async () => {
        const row0 = moderatorPage.locator('tr.setup-row').nth(0);

        // The picker button is only rendered when IS_MODERATOR is true (/?view=moderator)
        const pickerBtn = row0.locator('.suit-picker button[aria-haspopup="menu"]');
        await pickerBtn.click();

        // Filter to a unique icon name so the first result is deterministic
        const filterInput = moderatorPage.locator('.suit-picker-search input');
        await filterInput.fill('Bell');

        // Wait for the virtualised grid to render and click the "Bell" item
        const bellItem = moderatorPage.locator('.suit-picker-item[title="Bell"]');
        await expect(bellItem).toBeVisible({ timeout: 3000 });
        await bellItem.click({ force: true });

        // Picker closes; the button title updates to the selected icon key —
        // this confirms setIcon() was called and the socket event was emitted.
        await expect(pickerBtn).toHaveAttribute('title', 'Bell', { timeout: 5000 });
        await moderatorPage.waitForTimeout(waitHuman);
    });

    await test.step('Start Game', async () => {
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
    fs.appendFileSync('videos/setup.txt', `${displayVideoPath}\n${moderatorVideoPath}\n${displayAudioPath || ''}\n`);

    // Attempt merge, then clean up raw files
    try {
        execSync('node tests/merge-videos.js videos/setup.txt', { stdio: 'inherit' });
        try { fs.rmSync('videos/raw', { recursive: true, force: true }); } catch(e) {}
        try { fs.unlinkSync('videos/setup.txt'); } catch(e) {}
    } catch(e) {}
  });
});
