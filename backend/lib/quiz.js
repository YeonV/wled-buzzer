/**
 * Quiz question sync and answer judging.
 * Reads/writes shared state from lib/state.js.
 */
const path = require('path');
const fs = require('fs');
const state = require('./state');
const { lightsAll, lightsOne } = require('./lights');

let io = null;
function init(ctx) { io = ctx.getIo(); }

/** Read the active question set's questions array from disk */
async function readQuestions() {
  try {
    const active = JSON.parse(await fs.promises.readFile(state.ACTIVE_PACKS_PATH, 'utf8'));
    const qName = active.questions || 'default';
    for (const dir of [state.PACKS_DIR, state.CUSTOM_PACKS_DIR]) {
      const p = path.join(dir, qName, 'questions', 'questions.json');
      try { return JSON.parse(await fs.promises.readFile(p, 'utf8')); } catch {}
    }
  } catch {}
  return [];
}

/** Persist round history + display names to a timestamped JSON file */
async function persistResults(resultsDir) {
  await fs.promises.mkdir(resultsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const filename = `results_${ts}.json`;
  const filepath = path.join(resultsDir, filename);
  const payload = { savedAt: new Date().toISOString(), rounds: state.roundHistory, displayNames: state.displayNames };
  await fs.promises.writeFile(filepath, JSON.stringify(payload, null, 2), 'utf8');
  return { filename, filepath };
}

/** Register quiz-related socket handlers on a per-connection basis */
function registerHandlers(socket, { resultsDir }) {
  socket.on('setQuestionIndex', ({ index, mode }) => {
    if (state.gameLocked) {
      clearTimeout(state.resetTimer);
      state.gameLocked = false;
      io.emit('reset');
      io.emit('gameState', { locked: false });
      lightsAll('IDLE');
    }
    state.questionIndex   = Math.max(0, Number(index));
    state.showQuestion    = false;
    state.showAnswer      = false;
    state.showAnswersOnly = false;
    state.answerReveal    = { chosenIndex: null, correctIndex: null };
    state.hintIndex       = 0;
    state.lockedOutIds    = [];
    if (mode !== undefined) {
      state.gameMode = mode;
      io.emit('gameMode', { mode: state.gameMode });
    }
    io.emit('questionIndex',   { index: state.questionIndex });
    io.emit('showQuestion',    { show: state.showQuestion });
    io.emit('showAnswer',      { show: state.showAnswer });
    io.emit('showAnswersOnly', { show: state.showAnswersOnly });
    io.emit('answerReveal',    state.answerReveal);
    io.emit('hintState',       { hintIndex: state.hintIndex, lockedOutIds: state.lockedOutIds });
  });

  socket.on('setShowQuestion', ({ show }) => {
    state.showQuestion = !!show;
    io.emit('showQuestion', { show: state.showQuestion });
    if (show) { state.buzzerOpen = true; io.emit('buzzerOpen', { open: true }); }
  });

  socket.on('setShowAnswer', ({ show }) => {
    state.showAnswer = !!show;
    if (state.showAnswer) state.showAnswersOnly = false;
    io.emit('showAnswer',      { show: state.showAnswer });
    io.emit('showAnswersOnly', { show: state.showAnswersOnly });
  });

  socket.on('setShowAnswersOnly', ({ show }) => {
    state.showAnswersOnly = !!show;
    if (state.showAnswersOnly) state.showAnswer = false;
    io.emit('showAnswersOnly', { show: state.showAnswersOnly });
    io.emit('showAnswer',      { show: state.showAnswer });
    if (show) { state.buzzerOpen = true; io.emit('buzzerOpen', { open: true }); }
  });

  // ── Hint mode controls ─────────────────────────────────────────────────
  socket.on('nextHint', () => {
    if (state.gameMode !== 'hint') return;
    state.hintIndex = Math.max(0, state.hintIndex + 1);
    io.emit('hintState', { hintIndex: state.hintIndex, lockedOutIds: state.lockedOutIds });
    console.info(`💡  Hint ${state.hintIndex + 1} revealed`);
  });

  socket.on('judgeCall', async ({ winnerId, verdict, points, penalty }) => {
    if (!state.gameLocked) return;
    clearTimeout(state.resetTimer);

    // ── Hint mode: wrong answer → lockout + re-open ──────────────────
    if (state.gameMode === 'hint' && verdict === 'wrong') {
      const delta = penalty !== undefined ? +penalty : 0; // default: no penalty for wrong hint guess
      if (delta !== 0) {
        if (!(winnerId in state.scores)) state.scores[winnerId] = 0;
        state.scores[winnerId] += delta;
        io.emit('scoreUpdate', { scores: state.scores });
      }
      // Lock out this player for remaining hints
      if (!state.lockedOutIds.includes(winnerId)) state.lockedOutIds.push(winnerId);

      console.info(`❌  Hint wrong: ${winnerId}${delta ? ` ${delta} pts` : ''} — locked out (${state.lockedOutIds.length} total)`);
      io.emit('verdict', { verdict: 'wrong' });
      lightsOne(winnerId, 'LOSER');
      io.emit('hintState', { hintIndex: state.hintIndex, lockedOutIds: state.lockedOutIds });
      state.roundHistory.push({ roundNum: ++state.roundCounter, mode: 'hint', timestamp: Date.now(), questionIndex: state.questionIndex, awards: [{ id: winnerId, verdict: 'wrong', pts: delta }] });
      io.emit('roundHistory', state.roundHistory);
      state.saveCheckpoint();

      // Re-open buzzers for remaining players after a short delay
      setTimeout(() => {
        state.gameLocked = false;
        state.buzzerOpen = true;
        io.emit('gameState', { locked: false });
        io.emit('buzzerOpen', { open: true });
        io.emit('reset'); // clear winner highlight
        lightsAll('IDLE');
      }, 1200);
      return;
    }

    const delta = verdict === 'correct' ? +points : (penalty !== undefined ? +penalty : -points);
    if (!(winnerId in state.scores)) state.scores[winnerId] = 0;
    state.scores[winnerId] += delta;

    const icon = verdict === 'correct' ? '✅' : '❌';
    const modeLabel = state.gameMode === 'hint' ? 'hint' : 'quiz';
    console.info(`${icon}  ${winnerId}  ${delta > 0 ? '+' : ''}${delta} pts  (total: ${state.scores[winnerId]})`);

    io.emit('scoreUpdate', { scores: state.scores });
    io.emit('verdict', { verdict });

    lightsOne(winnerId, verdict === 'correct' ? 'WINNER' : 'LOSER');
    state.roundHistory.push({ roundNum: ++state.roundCounter, mode: modeLabel, timestamp: Date.now(), questionIndex: state.questionIndex, awards: [{ id: winnerId, verdict, pts: delta }] });
    io.emit('roundHistory', state.roundHistory);
    state.saveCheckpoint();
  });

  socket.on('judgeAnswer', async ({ winnerId, chosenIndex, correctIndex, points, penalty }) => {
    console.info('⤴️  Received judgeAnswer event:', { winnerId, chosenIndex, correctIndex, points, penalty, gameLocked: state.gameLocked });
    if (!state.gameLocked) { console.info('⤴️  judgeAnswer ignored because gameLocked=false'); return; }
    clearTimeout(state.resetTimer);

    const verdict = (chosenIndex !== null && chosenIndex !== undefined && chosenIndex === correctIndex)
      ? 'correct' : 'wrong';
    const delta = verdict === 'correct' ? +points : (penalty !== undefined ? +penalty : -points);
    if (!(winnerId in state.scores)) state.scores[winnerId] = 0;
    state.scores[winnerId] += delta;

    const icon = verdict === 'correct' ? '✅' : '❌';
    console.info(`${icon}  ${winnerId}  choice=${chosenIndex ?? 'none'}  correct=${correctIndex}  ${delta > 0 ? '+' : ''}${delta} pts  (total: ${state.scores[winnerId]})`);

    state.answerReveal = { chosenIndex: chosenIndex ?? null, correctIndex };
    state.showAnswer      = true;
    state.showAnswersOnly = false;
    io.emit('answerReveal',    state.answerReveal);
    io.emit('showAnswer',      { show: true });
    io.emit('showAnswersOnly', { show: false });

    io.emit('scoreUpdate', { scores: state.scores });
    io.emit('verdict', { verdict });

    lightsOne(winnerId, verdict === 'correct' ? 'WINNER' : 'LOSER');
    state.roundHistory.push({ roundNum: ++state.roundCounter, mode: 'quiz', timestamp: Date.now(), questionIndex: state.questionIndex, awards: [{ id: winnerId, verdict, chosenIndex: chosenIndex ?? null, correctIndex, pts: delta }] });
    io.emit('roundHistory', state.roundHistory);
    state.saveCheckpoint();
  });

  socket.on('undoLastRound', () => {
    if (state.roundHistory.length === 0) return;
    const last = state.roundHistory.pop();
    // Reverse all score deltas from that round
    for (const award of (last.awards ?? [])) {
      if (award.id in state.scores) {
        state.scores[award.id] -= award.pts;
      }
    }
    console.info(`↩️  Undo round ${last.roundNum} (${last.mode}): ${last.awards.map(a => `${a.id} ${a.pts > 0 ? '+' : ''}${a.pts}`).join(', ')} reversed`);
    io.emit('scoreUpdate', { scores: state.scores });
    io.emit('roundHistory', state.roundHistory);
    io.emit('undoResult', { ok: true, undone: last });
    // Reset game state (unlock, clear winner/verdict, IDLE lights)
    const winner = require('./winner');
    winner.resetGame();
    state.saveCheckpoint();
  });

  socket.on('clearRoundHistory', () => {
    state.roundHistory = []; state.roundCounter = 0;
    io.emit('roundHistory', state.roundHistory);
  });

  socket.on('saveRoundHistory', async () => {
    if (state.roundHistory.length === 0) { socket.emit('saveResult', { ok: false, msg: 'Nothing to save.' }); return; }
    try {
      const { filename, filepath } = await persistResults(resultsDir);
      console.info(`💾  Results saved: ${filepath}`);
      socket.emit('saveResult', { ok: true, filename, path: filepath });
    } catch (err) {
      console.error('Failed to save results:', err);
      socket.emit('saveResult', { ok: false, msg: err.message });
    }
  });

  // ── Loop / Video / Image Zoom / Aura / Stats / Final ─────────────────────
  socket.on('loopControl', ({ n }) => { io.emit('loopControl', { n: n ?? null }); });
  socket.on('videoControl', ({ url }) => { io.emit('videoControl', { url: url ?? null }); });
  socket.on('imageZoom', ({ src }) => { io.emit('imageZoom', { src: src ?? null }); });

  socket.on('toggleAura', ({ id }) => {
    if (!id) return;
    state.auraState[id] = !state.auraState[id];
    io.emit('auraState', state.auraState);
  });

  socket.on('setStatsOpen', ({ open }) => { io.emit('statsOpen', { open: !!open }); });

  socket.on('setFinalScreen', ({ open }) => {
    io.emit('finalScreen', { open: !!open });
    if (open && state.roundHistory.length > 0) {
      persistResults(resultsDir)
        .then(({ filepath }) => console.info(`💾  Auto-saved results: ${filepath}`))
        .catch(err => console.error('Auto-save failed:', err));
    }
  });
}

/** Emit quiz state to a freshly connected socket */
function emitState(socket) {
  socket.emit('roundHistory',    state.roundHistory);
  socket.emit('questionIndex',   { index: state.questionIndex });
  socket.emit('showQuestion',    { show: state.showQuestion });
  socket.emit('showAnswer',      { show: state.showAnswer });
  socket.emit('showAnswersOnly', { show: state.showAnswersOnly });
  socket.emit('answerReveal',    state.answerReveal);
  socket.emit('hintState', { hintIndex: state.hintIndex, lockedOutIds: state.lockedOutIds });
  readQuestions().then(qs => {
    if (qs[state.questionIndex]) socket.emit('currentQuestion', { index: state.questionIndex, question: qs[state.questionIndex] });
  }).catch(() => {});
}

module.exports = { init, readQuestions, persistResults, registerHandlers, emitState };
