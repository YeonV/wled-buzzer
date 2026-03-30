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

/** Click the first visible moderator action button from a list of likely selectors. */
async function clickModeratorAction(page) {
    const candidates = [
        '.moderator-freeanswer-grid .btn',
        '.judge-controls .btn',
        '.verdict-btns .btn',
        '.reveal-btns .btn',
        '.btn--error',
        '.btn--success',
        '.btn--accent',
        '.mod-btn',
        '#start-reflex',
    ];
    for (const sel of candidates) {
        try {
            await page.waitForSelector(sel, { timeout: 600, state: 'visible' });
            await page.locator(sel).first().click({ force: true });
            return;
        } catch (e) {
            // try next
        }
    }
    // Fallback: click the first visible button on the page
    await page.locator('button').first().click({ force: true });
}

test.describe('Multi-client Quiz Flow', () => {
  let buzzerList = [];

  test.beforeAll(async () => {
    if (!fs.existsSync('videos')) fs.mkdirSync('videos');
    if (!fs.existsSync('videos/raw')) fs.mkdirSync('videos/raw', { recursive: true });
    if (fs.existsSync('videos/paths.txt')) {
        try { fs.unlinkSync('videos/paths.txt'); } catch(e) {}
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

        // Navigate from index 0 → 4 (Multi-Quiz) using the moderator's ▶ button.
        // Each intro/rules slide is held for 2.5 s so it's readable in the recording.
        for (let i = 0; i < 4; i++) {
            await moderatorPage.locator('.question-nav .btn').last().click({ force: true });
            await moderatorPage.waitForTimeout(2500);
        }

        // Display scoreboard should now be visible (quiz question, not intro/rules)
        await expect(displayPage.locator('.scoreboard')).toBeVisible({ timeout: 15000 });
    });

    await test.step('Quiz Round: Blade Wins', async () => {
        // Index 4 — "Who invented the World Wide Web?" (correct: Tim Berners-Lee, index 0)
        // Wait for WLED preset setup: question card only renders once presetsReady=true
        await expect(moderatorPage.locator('.question-card')).toBeVisible({ timeout: 30000 });
        await moderatorPage.waitForTimeout(1000);

        // Arm buzzers: "Antworten zeigen" → setShowAnswersOnly → buzzerOpen=true
        await moderatorPage.locator('.reveal-btns .btn.btn--accent').click({ force: true });
        await moderatorPage.waitForTimeout(1500);

        await buzzerList[0].press(); // Blade buzzes first — tells moderator "Tim Berners-Lee"
        await expect(displayPage.locator('.score-row--buzzing')).toBeVisible({ timeout: 10000 });
        await expect(moderatorPage.locator('.score-row--buzzing')).toBeVisible({ timeout: 10000 });
        await moderatorPage.waitForTimeout(1500);

        // Moderator clicks answer A (index 0 = "Tim Berners-Lee") — click the answer and wait for server verdict
        await moderatorPage.waitForTimeout(2000);
        await moderatorPage.locator('.question-answer--clickable').nth(0).click({ force: true });
        await moderatorPage.waitForTimeout(2000);

        await expect(displayPage.locator('.score-pts').first()).toContainText('100');
        await moderatorPage.waitForTimeout(1000);

        // Navigate to Quiz 2 (index 5) via ▶
            await moderatorPage.locator('.question-nav .btn').last().click({ force: true });
        await moderatorPage.waitForTimeout(1200);
    });

    await test.step('Quiz Round: Noob Loses', async () => {
        // Index 5 — "What does SQL stand for?" — Noob buzzes and gets penalised
        await expect(moderatorPage.locator('.question-card')).toBeVisible({ timeout: 30000 });
        await moderatorPage.waitForTimeout(800);

        // Arm buzzers
        await moderatorPage.locator('.reveal-btns .btn.btn--accent').click({ force: true });
        await moderatorPage.waitForTimeout(1500);

        await buzzerList[3].press(); // Noob buzzes — tells moderator "Standard Query Logic" (wrong)
        await expect(moderatorPage.locator('.score-row--buzzing')).toBeVisible({ timeout: 10000 });
        await moderatorPage.waitForTimeout(1500);

        // Moderator clicks answer B (index 1 = "Standard Query Logic") — auto-wrong because correct=0
        await moderatorPage.locator('.question-answer--clickable').nth(1).click({ force: true });
        await moderatorPage.waitForTimeout(1500);

        // Navigate to Quiz 3 (index 6) via ▶
        await moderatorPage.locator('.question-nav .btn').last().click({ force: true });
        await moderatorPage.waitForTimeout(1200);
    });

    await test.step('BladeLock: Player 3 Buzzes Illegally (×4)', async () => {
        // Index 6 — buzzers are locked (buzzerOpen=false after nav); Player 3 escalates:
        //   count 1 → "HANDS OFF THE BUZZER!" (warning, 0 pts)
        //   count 2 → "SERIOUSLY. STOP."       (−100 pts)
        //   count 3 → "ONE MORE AND YOU'RE OUT" (−200 pts)
        //   count 4 → "DISQUALIFIED FOR THIS ROUND! 🚫" (−300 pts)
        await expect(moderatorPage.locator('.question-card')).toBeVisible({ timeout: 15000 });
        await moderatorPage.waitForTimeout(600);

        for (let offense = 1; offense <= 4; offense++) {
            await buzzerList[2].press();
            await expect(displayPage.locator('.blade-lock-toast')).toBeVisible({ timeout: 5000 });
            await expect(moderatorPage.locator('.blade-lock-toast')).toBeVisible({ timeout: 5000 });
            // Hold 1.5 s so the toast is readable in the video, then wait for auto-dismiss
            await moderatorPage.waitForTimeout(1500);
            await expect(displayPage.locator('.blade-lock-toast')).toBeHidden({ timeout: 5000 });
            await moderatorPage.waitForTimeout(300);
        }
        await moderatorPage.waitForTimeout(500);
    });

    await test.step('Quiz Round: No One Answers — Timeout', async () => {
        // Index 6 — "How many bits are in a byte?" — Player 3 buzzes but times out
        await expect(moderatorPage.locator('.question-card')).toBeVisible({ timeout: 30000 });
        await moderatorPage.waitForTimeout(800);

        // Arm buzzers (BladeLock step above left buzzerOpen=false)
        await moderatorPage.locator('.reveal-btns .btn.btn--accent').click({ force: true });
        await moderatorPage.waitForTimeout(1500);

        await buzzerList[2].press(); // Player 3 buzzes but fails to answer
        await expect(moderatorPage.locator('.score-row--buzzing')).toBeVisible({ timeout: 10000 });

        // Wait for the 5-second auto-wrong timer to expire (autoWrongMsDefault = 5000)
        await moderatorPage.waitForTimeout(5500);

        // Moderator confirms "Too Late" — Player 3 gets penalised
            await moderatorPage.locator('.btn--error').click({ force: true });
        await moderatorPage.waitForTimeout(1500);

        // Navigate to Quiz 4 (index 7) via ▶
        await moderatorPage.locator('.question-nav .btn').last().click({ force: true });
        await moderatorPage.waitForTimeout(1200);
    });

    await test.step('Quiz Round: Moderator Skips', async () => {
        // Index 7 — "In which year was Linux first released?" — Player 2 buzzes, moderator skips
        await expect(moderatorPage.locator('.question-card')).toBeVisible({ timeout: 30000 });
        await moderatorPage.waitForTimeout(800);

        // Arm buzzers
        await moderatorPage.locator('.reveal-btns .btn.btn--accent').click({ force: true });
        await moderatorPage.waitForTimeout(1500);

        await buzzerList[1].press(); // Player 2 buzzes
        await expect(moderatorPage.locator('.score-row--buzzing')).toBeVisible({ timeout: 10000 });
        await moderatorPage.waitForTimeout(1500);

        // Moderator clicks the reset/skip ghost button — no points awarded
        await moderatorPage.locator('.moderator-freeanswer-grid .btn.btn--ghost').click({ force: true });
        await moderatorPage.waitForTimeout(1000);

        // Navigate to quiz-single 1 (index 8) via ▶
        await moderatorPage.locator('.question-nav .btn').last().click({ force: true });
        await moderatorPage.waitForTimeout(1200);
    });

    await test.step('Quiz Single: Blade Wins — E1.31/DDP', async () => {
        // Index 8 — "Above how many LEDs does WLED recommend switching from E1.31/UDP to DDP?"
        // Free-text question with pretext; IS_MODERATOR shows mod-btn--correct / mod-btn--wrong
        await expect(moderatorPage.locator('.question-card')).toBeVisible({ timeout: 30000 });
        await moderatorPage.waitForTimeout(800);

        // Reveal the actual question (pretext is shown first)
        await moderatorPage.locator('.reveal-btns .btn.btn--accent').click({ force: true });
        await moderatorPage.waitForTimeout(1500);

        await buzzerList[0].press(); // Blade buzzes and answers "490"
        await expect(moderatorPage.locator('.score-row--buzzing')).toBeVisible({ timeout: 10000 });
        await moderatorPage.waitForTimeout(1200);

        // Show the answer on all screens so everyone can verify before judging
        await moderatorPage.locator('.btn--accent').first().click({ force: true });
        await moderatorPage.waitForTimeout(1200);

        // IS_MODERATOR free-text judge: click the real ✓ button
        await moderatorPage.locator('.btn--success').click({ force: true });
        await moderatorPage.waitForTimeout(1500);

        // Navigate to quiz-single 2 (index 9) via ▶
        await moderatorPage.locator('.question-nav .btn').last().click({ force: true });
        await moderatorPage.waitForTimeout(1200);
    });

    await test.step('Quiz Single: Noob Loses — GitHub Username', async () => {
        // Index 9 — "What is the GitHub username of WLED UI contributor Blade?"
        // Free-text, no pretext — no auto-arm button, so moderator opens buzzers via lock toggle
        await expect(moderatorPage.locator('.question-card')).toBeVisible({ timeout: 30000 });
        await moderatorPage.waitForTimeout(800);

        // Arm buzzers manually (no pretext → no Frage-zeigen button to auto-arm)
        await moderatorPage.locator('[data-test="btn-buzzer"]').click({ force: true });
        await moderatorPage.waitForTimeout(1500);

        await buzzerList[3].press(); // Noob buzzes and says "Daywalker" (wrong)
        await expect(moderatorPage.locator('.score-row--buzzing')).toBeVisible({ timeout: 10000 });
        await moderatorPage.waitForTimeout(1200);

        // Show the answer on all screens ("YeonV") so everyone can see the correct answer
        await moderatorPage.locator('.btn--accent').first().click({ force: true });
        await moderatorPage.waitForTimeout(1200);

        // IS_MODERATOR free-text judge: click the real ✗ button
        await moderatorPage.locator('.btn--error').click({ force: true });
        await moderatorPage.waitForTimeout(1500);

        // Navigate to Iterative Timer (index 10) via ▶
        await moderatorPage.locator('.question-nav .btn').last().click({ force: true });
        await moderatorPage.waitForTimeout(1200);
    });

    await test.step('Iterative Timer: Fastest — Blade Wins', async () => {
        // Index 10 — fastest: shortest hold time wins; Blade=200ms (1st), Noob=1500ms (last)
        await expect(moderatorPage.locator('.question-card')).toBeVisible({ timeout: 15000 });
        await moderatorPage.waitForTimeout(800);

        await moderatorPage.locator('.reveal-btns .btn.btn--accent').click({ force: true });
        await moderatorPage.waitForTimeout(500);

        // All 4 players take turns — shorter hold = better in fastest mode
        const holdTimes = [200, 600, 1000, 1500]; // Blade shortest → wins; Noob longest → loses
        for (let i = 0; i < BUZZERS.length; i++) {
            await buzzerList[i].press();
            // wait briefly for the dedicated iter stop button, otherwise fall back
            try { await moderatorPage.waitForSelector('#iter-stop-btn', { timeout: 3000, state: 'visible' }); } catch (e) {}
            await moderatorPage.waitForTimeout(holdTimes[i]);
            if (await moderatorPage.locator('#iter-stop-btn').count() > 0) {
                await moderatorPage.locator('#iter-stop-btn').click({ force: true });
            }
            await moderatorPage.waitForTimeout(700);
        }

        // Finish & award points
        await expect(moderatorPage.locator('.btn.btn--accent.btn--stretch')).toBeVisible({ timeout: 5000 });
        await moderatorPage.locator('.btn.btn--accent.btn--stretch').click({ force: true });
        await moderatorPage.waitForTimeout(1000);

        // Show results
        await expect(moderatorPage.locator('.reflex-result')).toBeVisible({ timeout: 5000 });
        await moderatorPage.waitForTimeout(1500);

        // Next Round — btn-start-reflex auto-navigates to index 11 (itimer 2)
        await moderatorPage.locator('#start-reflex').click({ force: true });
        await moderatorPage.waitForTimeout(1200);
    });

    await test.step('Iterative Timer: Longest — Noob Loses', async () => {
        // Index 11 — longest: highest hold time wins; Blade=1500ms (1st), Noob=200ms (last)
        await expect(moderatorPage.locator('.question-card')).toBeVisible({ timeout: 15000 });
        await moderatorPage.waitForTimeout(800);

        await moderatorPage.locator('.reveal-btns .btn.btn--accent').click({ force: true });
        await moderatorPage.waitForTimeout(1500);

        // All 4 players take turns — longer hold = better in longest mode
        const holdTimes = [1500, 1000, 600, 200]; // Blade longest → wins; Noob shortest → loses
        for (let i = 0; i < BUZZERS.length; i++) {
            await buzzerList[i].press();
            try { await moderatorPage.waitForSelector('#iter-stop-btn', { timeout: 3000, state: 'visible' }); } catch (e) {}
            await moderatorPage.waitForTimeout(holdTimes[i]);
            if (await moderatorPage.locator('#iter-stop-btn').count() > 0) {
                await moderatorPage.locator('#iter-stop-btn').click({ force: true });
            }
            await moderatorPage.waitForTimeout(700);
        }

        // Finish & award points
        await expect(moderatorPage.locator('.btn.btn--accent.btn--stretch')).toBeVisible({ timeout: 5000 });
        await moderatorPage.locator('.btn.btn--accent.btn--stretch').click({ force: true });
        await moderatorPage.waitForTimeout(1000);

        // Show results
        await expect(moderatorPage.locator('.reflex-result')).toBeVisible({ timeout: 5000 });
        await moderatorPage.waitForTimeout(1500);

        // Next Round — auto-navigates to index 12 (itimer amount)
        await moderatorPage.locator('#start-reflex').click({ force: true });
        await moderatorPage.waitForTimeout(1200);
    });

    await test.step('Iterative Timer: Amount — Blade Wins', async () => {
        // Index 12 — amount: most reps wins; Blade=10 (1st), Noob=2 (last)
        await expect(moderatorPage.locator('.question-card')).toBeVisible({ timeout: 15000 });
        await moderatorPage.waitForTimeout(800);

        await moderatorPage.locator('.reveal-btns .btn.btn--accent').click({ force: true });
        await moderatorPage.waitForTimeout(1500);

        // All 4 players take turns — rep counts entered after all have gone
        for (let i = 0; i < BUZZERS.length; i++) {
            await buzzerList[i].press();
            try { await moderatorPage.waitForSelector('#iter-stop-btn', { timeout: 3000, state: 'visible' }); } catch (e) {}
            await moderatorPage.waitForTimeout(600);
            if (await moderatorPage.locator('#iter-stop-btn').count() > 0) {
                await moderatorPage.locator('#iter-stop-btn').click({ force: true });
            } else {
                await clickModeratorAction(moderatorPage);
            }
            await moderatorPage.waitForTimeout(600);
        }

        // All done — fill rep counts in the displayed order (sorted by time = buzz order: fastest first)
        // Buzz order was Blade(0)→P2(1)→P3(2)→Noob(3); sorted fastest-first that's the same order
        const repCounts = [10, 7, 5, 2];
        const inputs = moderatorPage.locator('.iter-amount-input');
        await expect(inputs).toHaveCount(BUZZERS.length, { timeout: 5000 });
        for (let i = 0; i < BUZZERS.length; i++) {
            await inputs.nth(i).fill(String(repCounts[i]));
            await moderatorPage.waitForTimeout(300);
        }

        // Finish & award points
        await expect(moderatorPage.locator('.btn.btn--accent.btn--stretch')).toBeVisible({ timeout: 5000 });
        await moderatorPage.locator('.btn.btn--accent.btn--stretch').click({ force: true });
        await moderatorPage.waitForTimeout(1000);

        await expect(moderatorPage.locator('.reflex-result')).toBeVisible({ timeout: 5000 });
        await moderatorPage.waitForTimeout(1500);

        // Next Round — auto-navigates to index 13 (image quiz)
        await moderatorPage.locator('#start-reflex').click({ force: true });
        await moderatorPage.waitForTimeout(1200);
    });

    await test.step('Perform Image Quiz Round', async () => {
        // Index 13 — image-based multiple-choice quiz
        await expect(moderatorPage.locator('.question-card')).toBeVisible({ timeout: 15000 });
        await moderatorPage.waitForTimeout(800);

        // Arm buzzers
        await moderatorPage.locator('.reveal-btns .btn.btn--accent').click({ force: true });
        await moderatorPage.waitForTimeout(1500);

        // Buzz
        await buzzerList[0].press();

        await expect(displayPage.locator('.score-row--buzzing')).toBeVisible({ timeout: 10000 });
        await expect(moderatorPage.locator('.score-row--buzzing')).toBeVisible({ timeout: 10000 });
        await moderatorPage.waitForTimeout(1500);

        // Judge correct via judgeAnswer (correct answer is index 0)
        await moderatorPage.evaluate(() => {
            window.socket.emit('judgeAnswer', { winnerId: 'BB0001', chosenIndex: 0, correctIndex: 0, points: 100 });
        });
        await moderatorPage.waitForTimeout(1500);

        // Navigate to Timer Round (index 14) via ▶
        await moderatorPage.locator('.question-nav .btn').last().click({ force: true });
        await moderatorPage.waitForTimeout(1200);
    });

    await test.step('Perform Timer Round', async () => {
        // Index 14 — sport timer; Blade wins (buzzes first), Noob loses (buzzes last)
        // All 4 rostered players buzz → allIn fires → round auto-closes (no manual End Round needed)
        await expect(moderatorPage.locator('.question-card')).toBeVisible({ timeout: 15000 });
        await moderatorPage.waitForTimeout(800);

        // Start timer (3-second countdown then running)
        await moderatorPage.locator('.reveal-btns .btn.btn--accent').click({ force: true });

        // Wait for running phase
        await expect(moderatorPage.locator('.timer-elapsed')).toBeVisible({ timeout: 10000 });
        await moderatorPage.waitForTimeout(300);

        // All 4 buzz in order: Blade first (wins), Noob last (loses)
        await buzzerList[0].press();
        await moderatorPage.waitForTimeout(250);
        await buzzerList[1].press();
        await moderatorPage.waitForTimeout(250);
        await buzzerList[2].press();
        await moderatorPage.waitForTimeout(250);
        await buzzerList[3].press();
        // allIn = true → closeTimerRound() fires automatically

        await expect(moderatorPage.locator('.reflex-result')).toBeVisible({ timeout: 10000 });
        await moderatorPage.waitForTimeout(1500);

        // Index 14 = last question → btn-start-reflex triggers setFinalScreen
        await moderatorPage.locator('#start-reflex').click({ force: true });
        await moderatorPage.waitForTimeout(1200);
    });

    await test.step('Verify Podium Screen', async () => {
        await expect(displayPage.locator('.final-screen')).toBeVisible({ timeout: 15000 });
        await expect(displayPage.locator('.final-podium')).toBeVisible({ timeout: 5000 });
        await displayPage.waitForTimeout(5000);

        // Open Round History panel on the moderator so it's captured in the recording
        await moderatorPage.locator('button', { hasText: 'Round History' }).click({ force: true });
        await moderatorPage.waitForTimeout(10000);
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
    fs.appendFileSync('videos/paths.txt', `${displayVideoPath}\n${moderatorVideoPath}\n${displayAudioPath || ''}\n`);

    // Attempt merge
    try {
        execSync('node tests/merge-videos.js', { stdio: 'inherit' });
    } catch(e) {}
  });
});
