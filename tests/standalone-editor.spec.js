const { test, expect } = require('@playwright/test');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let previewProcess;
let recordedVideoPath;
const PREVIEW_PORT = 4174;
const BASE_URL = `http://localhost:${PREVIEW_PORT}/standalone.html`;

test.describe('Standalone Questions Editor', () => {
  test.beforeAll(async () => {
    const frontendDir = path.join(__dirname, '..', 'frontend');
    const viteBin = path.join(frontendDir, 'node_modules', '.bin', 'vite');
    previewProcess = spawn(viteBin, ['preview', '--port', String(PREVIEW_PORT)], {
      cwd: frontendDir,
      env: { ...process.env },
      shell: process.platform === 'win32',
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Vite preview timed out')), 15000);
      const onData = (data) => {
        const output = data.toString();
        if (output.includes('Local:') || output.includes('localhost') || output.includes(String(PREVIEW_PORT))) {
          clearTimeout(timeout);
          setTimeout(resolve, 500); // brief settle
        }
      };
      previewProcess.stdout.on('data', onData);
      previewProcess.stderr.on('data', onData);
      previewProcess.on('close', (code) => {
        if (code !== 0 && code !== null) { clearTimeout(timeout); reject(new Error(`Vite exited ${code}`)); }
      });
    });
  });

  test('Full editor workflow', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('.qe-title')).toBeVisible({ timeout: 10000 });

    // ── 1: Default set loads ──────────────────────────────────────────────
    await test.step('Default set loads with built-in questions', async () => {
      // "built-in" set should be listed and selected (active class)
      const activeItem = page.locator('.qe-audio-item--active');
      await expect(activeItem).toBeVisible();
      await expect(activeItem.locator('.qe-audio-label')).toContainText('built-in');
    });

    // ── 2: Create a new set ──────────────────────────────────────────────
    await test.step('Create a new question set', async () => {
      const input = page.locator('input[placeholder*="New set"]');
      await input.fill('My Quiz');

      const createBtn = page.locator('button', { hasText: 'Create' });
      await expect(createBtn).toBeEnabled();
      await createBtn.click();

      // New set should be active
      const activeItem = page.locator('.qe-audio-item--active');
      await expect(activeItem.locator('.qe-audio-label')).toContainText('My Quiz');

      // New set should be empty
      expect(await page.locator('.qe-row').count()).toBe(0);
    });

    // ── 3: Add one question per mode and variant ──────────────────────────
    // Modes: intro, rules, text, config, quiz (multi + free), timer (fastest + longest), itimer (fastest + longest + amount)
    const QUESTION_DEFS = [
      { mode: 'intro',  label: 'Intro slide',             text: 'Welcome to the Quiz!' },
      { mode: 'rules',  label: 'Rules slide',             text: 'Here are the rules…' },
      { mode: 'text',   label: 'Text slide',              text: 'Fun fact: The Earth is round.' },
      { mode: 'config', label: 'Config slide' },
      { mode: 'quiz',   label: 'Quiz (multiple choice)',  text: 'What is the capital of France?', variant: 'multiple', answers: ['Paris', 'London', 'Berlin', 'Madrid'] },
      { mode: 'quiz',   label: 'Quiz (free text)',        text: 'Name the largest ocean.', variant: 'free', pretext: 'Geography question:' },
      { mode: 'timer',  label: 'Timer (fastest)',         text: 'Speed round!', scoring: 'fastest' },
      { mode: 'timer',  label: 'Timer (longest)',         text: 'Endurance round!', scoring: 'longest' },
      { mode: 'itimer', label: 'I-Timer (fastest)',       text: 'Individual fastest', scoring: 'fastest' },
      { mode: 'itimer', label: 'I-Timer (longest)',       text: 'Individual longest', scoring: 'longest' },
      { mode: 'itimer', label: 'I-Timer (amount)',        text: 'Individual amount', scoring: 'amount' },
    ];

    let expectedRowCount = 0;
    for (const def of QUESTION_DEFS) {
      await test.step(`Add: ${def.label}`, async () => {
        await page.locator('button', { hasText: 'Add question' }).click();
        expectedRowCount++;
        expect(await page.locator('.qe-row').count()).toBe(expectedRowCount);

        const openRow = page.locator('.qe-row--open');
        await expect(openRow).toBeVisible();

        // Select mode
        const modeSelect = openRow.locator('.qe-select').first();
        await modeSelect.selectOption(def.mode);

        // Mode-specific setup
        if (def.mode === 'config') {
          // Config: verify 4 selects (mode + lang + theme + position), set values
          await expect(openRow.locator('select')).toHaveCount(4);
          const selects = openRow.locator('.qe-select');
          await selects.nth(1).selectOption('de');     // lang → Deutsch
          await selects.nth(2).selectOption('jungle'); // theme → Jungle
          await selects.nth(3).selectOption('top');    // scoreboard → top

        } else if (def.mode === 'quiz' && def.variant) {
          // Quiz: select answer type variant
          const variantSelect = openRow.locator('.qe-select').nth(1);
          await variantSelect.selectOption(def.variant);

          // Fill question text
          await openRow.locator('textarea').first().fill(def.text);

          if (def.variant === 'multiple') {
            // Fill 4 answer inputs
            const answerInputs = openRow.locator('.qe-choice-input');
            for (let i = 0; i < def.answers.length; i++) {
              await answerInputs.nth(i).fill(def.answers[i]);
            }
            // Mark first as correct
            await openRow.locator('input[type="radio"]').first().check();

          } else if (def.variant === 'free') {
            // Fill pretext if provided
            if (def.pretext) {
              const pretextInput = openRow.locator('.qe-pretext-input');
              await pretextInput.fill(def.pretext);
            }
          }

        } else if ((def.mode === 'timer' || def.mode === 'itimer') && def.scoring) {
          // Timer / I-Timer: select scoring variant
          const scoringSelect = openRow.locator('.qe-select').nth(1);
          await scoringSelect.selectOption(def.scoring);

          // Fill question text
          await openRow.locator('textarea').first().fill(def.text);

        } else if (def.text) {
          // Simple text modes (intro, rules, text)
          await openRow.locator('textarea').first().fill(def.text);
        }
      });
    }

    // ── 4: Verify all questions created ─────────────────────────────────
    await test.step(`Verify all ${QUESTION_DEFS.length} questions created`, async () => {
      expect(await page.locator('.qe-row').count()).toBe(QUESTION_DEFS.length);
    });

    // ── 5: Reorder — move first question down ─────────────────────────────
    await test.step('Reorder questions via move buttons', async () => {
      // Open first row
      await page.locator('.qe-row-header').nth(0).click();
      const firstOpen = page.locator('.qe-row--open');
      await expect(firstOpen).toBeVisible();

      // Click move down
      const moveDownBtn = firstOpen.locator('button[title*="own"]').first();
      await moveDownBtn.click();
      // First row should now be different (the old second is now first)
      const newFirstBadge = await page.locator('.qe-row').nth(0).locator('.qe-row-mode-badge').textContent();
      expect(newFirstBadge).toBe('rules'); // rules was #2, now should be #1
    });

    // ── 7: Save ───────────────────────────────────────────────────────────
    await test.step('Save questions', async () => {
      const saveBtn = page.locator('button', { hasText: 'Save' });
      await expect(saveBtn).toBeEnabled();
      await saveBtn.click();

      // Should become disabled after save (no dirty changes)
      await expect(saveBtn).toBeDisabled({ timeout: 5000 });
    });

    // ── 8: Switch sets and back ───────────────────────────────────────────
    await test.step('Switch between sets preserves data', async () => {
      // Click built-in set
      await page.locator('.qe-audio-item .qe-audio-label', { hasText: 'built-in' }).click();
      await page.waitForTimeout(1000);

      // Built-in might have questions or not — just verify it switched
      const activeItem = page.locator('.qe-audio-item--active .qe-audio-label');
      await expect(activeItem).toContainText('built-in');

      // Switch back to My Quiz
      await page.locator('.qe-audio-item .qe-audio-label', { hasText: 'My Quiz' }).click();
      await page.waitForTimeout(1000);

      // Should still have all our questions
      const count = await page.locator('.qe-row').count();
      expect(count).toBe(QUESTION_DEFS.length);
    });

    // ── 9: Delete a question ──────────────────────────────────────────────
    await test.step('Delete a question', async () => {
      // Open first row
      await page.locator('.qe-row-header').nth(0).click();

      // Find and click delete button inside the open row
      const openRow = page.locator('.qe-row--open');
      const deleteBtn = openRow.locator('button[title*="elete"]').first();
      if (await deleteBtn.count() > 0) {
        await deleteBtn.click();
        expect(await page.locator('.qe-row').count()).toBe(QUESTION_DEFS.length - 1);
      }
    });

    // ── 10: Export JSON ───────────────────────────────────────────────────
    await test.step('Export JSON triggers download', async () => {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('button', { hasText: /JSON/ }).first().click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.json$/);
    });

    // ── 11: Export ZIP ────────────────────────────────────────────────────
    await test.step('Export ZIP triggers download', async () => {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('button', { hasText: /Export ZIP/ }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.zip$/);
    });

    // ── 12: Delete the test set ───────────────────────────────────────────
    await test.step('Delete custom set returns to built-in', async () => {
      // Ensure we're on "My Quiz"
      const myQuizLabel = page.locator('.qe-audio-item .qe-audio-label', { hasText: 'My Quiz' });
      const myQuizExists = await myQuizLabel.count() > 0;
      if (!myQuizExists) {
        // Set was already deleted or doesn't exist — skip
        return;
      }
      await myQuizLabel.click();
      await page.waitForTimeout(500);

      page.once('dialog', dialog => dialog.accept());

      const myQuizItem = page.locator('.qe-audio-item', { hasText: 'My Quiz' });
      await myQuizItem.locator('.qe-delete').click();
      await page.waitForTimeout(1000);

      // "My Quiz" should no longer appear in the set list
      await expect(page.locator('.qe-audio-item .qe-audio-label', { hasText: 'My Quiz' })).toHaveCount(0);
    });

    // ── Capture video path for mp4 conversion ─────────────────────────────
    recordedVideoPath = await page.video().path();
  });

  test.afterAll(async () => {
    if (previewProcess) previewProcess.kill();

    // Convert webm → mp4
    if (recordedVideoPath && fs.existsSync(recordedVideoPath)) {
      if (!fs.existsSync('videos')) fs.mkdirSync('videos', { recursive: true });
      const ffmpeg = require('ffmpeg-static');
      try {
        execSync(`"${ffmpeg}" -y -i "${recordedVideoPath}" -c:v libx264 -preset fast -crf 23 videos/standalone-editor.mp4`, { stdio: 'inherit' });
        console.log('Merged video created: videos/standalone-editor.mp4');
      } catch (e) {
        console.error('Video conversion failed:', e.message);
      }
    }
  });
});
