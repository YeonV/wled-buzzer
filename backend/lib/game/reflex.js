'use strict';
const {
  REFLEX_COLLECT_MS, REFLEX_RESULTS_MS, REFLEX_COUNTDOWN_STEP_MS,
  REFLEX_FLASH_MIN_MS, REFLEX_FLASH_RANGE_MS,
} = require('../../constants');

const REFLEX_COLORS = ['red', 'yellow', 'green', 'purple', 'orange', 'pink'];

// ── Shared context (injected via init) ───────────────────────────────────────
let ctx = null;

// ── Reflex state ─────────────────────────────────────────────────────────────
let reflexState       = 'idle';  // 'idle'|'countdown'|'sequence'|'go'|'closed'
let reflexBuzzes      = [];      // [{id, ms}] ordered by arrival
let reflexFalseStarts = [];      // [id] — buzzed before GO signal
let reflexGoTime      = null;
let reflexSeqTimer    = null;

// ── Survivor state ────────────────────────────────────────────────────────────
let survivorState      = 'idle';  // 'idle'|'playing'|'done'
let survivorEliminated = [];      // [id] — already out
let survivorRound      = 0;

function init(context) { ctx = context; }

// ─────────────────────────────────────────────
//  REFLEX
// ─────────────────────────────────────────────
async function runReflexRound() {
  reflexState       = 'countdown';
  reflexBuzzes      = [];
  reflexFalseStarts = [];
  reflexGoTime      = null;
  const io = ctx.getIo();
  io.emit('reflexState', { state: 'countdown' });

  for (let i = 3; i >= 1; i--) {
    io.emit('reflexCountdown', { count: i });
    await ctx.sleep(REFLEX_COUNTDOWN_STEP_MS);
  }

  reflexState = 'sequence';
  io.emit('reflexState', { state: 'sequence' });

  const numFlashes = Math.floor(Math.random() * 8) + 4; // 4–11 distractors
  for (let i = 0; i < numFlashes; i++) {
    const color = REFLEX_COLORS[Math.floor(Math.random() * REFLEX_COLORS.length)];
    io.emit('reflexFlash', { color });
    await ctx.sleep(Math.floor(Math.random() * REFLEX_FLASH_RANGE_MS) + REFLEX_FLASH_MIN_MS);
  }

  // GO!
  reflexState  = 'go';
  reflexGoTime = Date.now();
  io.emit('reflexState', { state: 'go' });
  io.emit('reflexFlash', { color: 'blue', go: true });

  reflexSeqTimer = setTimeout(closeReflexRound, REFLEX_COLLECT_MS);
}

function handleBuzz(deviceId) {
  const io = ctx.getIo();
  if (reflexState === 'countdown' || reflexState === 'sequence') {
    if (!reflexFalseStarts.includes(deviceId)) {
      reflexFalseStarts.push(deviceId);
      console.info(`⚡  False start: ${deviceId}`);
      io.emit('reflexFalseStart', { id: deviceId });
    }
    return;
  }
  if (reflexState === 'go') {
    const already  = reflexBuzzes.some(b => b.id === deviceId);
    const wasFalse = reflexFalseStarts.includes(deviceId);
    if (!already && !wasFalse) {
      const ms  = Date.now() - reflexGoTime;
      reflexBuzzes.push({ id: deviceId, ms });
      const pos = reflexBuzzes.length;
      console.info(`⏱️  Buzz #${pos}: ${deviceId} (${ms}ms)`);
      io.emit('reflexBuzz', { id: deviceId, ms, position: pos });
      if (pos >= 4) { clearTimeout(reflexSeqTimer); closeReflexRound(); }
    }
  }
}

function closeReflexRound() {
  reflexState = 'closed';
  const io = ctx.getIo();
  io.emit('reflexState', { state: 'closed' });

  const multipliers = [3, 2, 1, 0];
  const awards = reflexBuzzes.map((b, i) => {
    const mult = multipliers[i] ?? 0;
    const pts  = mult * ctx.getCurrentPoints();
    if (!(b.id in ctx.scores)) ctx.scores[b.id] = 0;
    ctx.scores[b.id] += pts;
    return { id: b.id, ms: b.ms, position: i + 1, multiplier: mult, pts };
  });

  reflexFalseStarts.forEach(id => {
    if (!(id in ctx.scores)) ctx.scores[id] = 0;
    ctx.scores[id] -= ctx.getCurrentPoints();
  });

  io.emit('reflexResult', { awards, falseStarts: reflexFalseStarts });
  io.emit('scoreUpdate', { scores: ctx.scores });
  ctx.getRoundHistory().push({ roundNum: ctx.incRoundCounter(), mode: 'reflex', timestamp: Date.now(), awards, falseStarts: reflexFalseStarts });
  io.emit('roundHistory', ctx.getRoundHistory());
  ctx.saveCheckpoint();
  console.info(`🏁  Reflex round: ${awards.length} finishers, ${reflexFalseStarts.length} false starts.`);

  // Auto-reset only when Survivor is managing the round; otherwise moderator advances manually
  if (survivorState === 'playing') {
    setTimeout(() => {
      reflexState = 'idle';
      io.emit('reflexState', { state: 'idle' });
      io.emit('reflexReset');
      ctx.lightsAll('IDLE');
    }, REFLEX_RESULTS_MS);
  }
}

function abortReflexRound() {
  clearTimeout(reflexSeqTimer);
  reflexState       = 'idle';
  reflexBuzzes      = [];
  reflexFalseStarts = [];
  reflexGoTime      = null;
  console.info('🔄  Reflex round aborted.');
  const io = ctx.getIo();
  io.emit('reflexAborted');
  io.emit('reflexState', { state: 'idle' });
}

// ─────────────────────────────────────────────
//  SURVIVOR  (meta-layer on top of Reflex)
// ─────────────────────────────────────────────
function startSurvivorMode() {
  survivorState      = 'playing';
  survivorEliminated = [];
  survivorRound      = 0;
  const io = ctx.getIo();
  io.emit('survivorState', { state: 'playing', eliminated: survivorEliminated, round: survivorRound });
  console.info('🏆  Survivor mode started.');
  runSurvivorRound();
}

async function runSurvivorRound() {
  const active = ctx.getBuzzerRoster().filter(r => !survivorEliminated.includes(r.hexId));
  const io = ctx.getIo();

  if (active.length <= 1) {
    survivorState = 'done';
    const finalWinner = active[0] ?? null;
    io.emit('survivorDone', { winnerId: finalWinner?.hexId ?? null });
    io.emit('survivorState', { state: 'done', eliminated: survivorEliminated, round: survivorRound });
    console.info(`🏆  Survivor done! Winner: ${finalWinner?.hexId ?? 'nobody'}`);
    ctx.lightsAll('WINNER');
    setTimeout(() => {
      survivorState = 'idle';
      io.emit('survivorState', { state: 'idle', eliminated: [], round: 0 });
    }, REFLEX_RESULTS_MS * 2);
    return;
  }

  survivorRound++;
  io.emit('survivorState', { state: 'playing', eliminated: survivorEliminated, round: survivorRound });
  io.emit('survivorRoundStart', { round: survivorRound, active: active.map(r => r.hexId) });

  await runReflexRound();
  await waitForReflexClosed();

  if (survivorState !== 'playing') return; // aborted

  const activeScores = active.map(r => ({ id: r.hexId, pts: ctx.scores[r.hexId] ?? 0 }));
  activeScores.sort((a, b) => a.pts - b.pts);
  const toEliminate = activeScores[0].id;

  survivorEliminated.push(toEliminate);
  io.emit('survivorElimination', { eliminatedId: toEliminate, round: survivorRound });
  io.emit('survivorState', { state: 'playing', eliminated: survivorEliminated, round: survivorRound });
  console.info(`💀  Survivor round ${survivorRound}: ${toEliminate} eliminated.`);
}

function waitForReflexClosed() {
  return new Promise((resolve) => {
    if (reflexState === 'idle') { resolve(); return; }
    const check = setInterval(() => {
      if (reflexState === 'idle') { clearInterval(check); resolve(); }
    }, 500);
  });
}

function abortSurvivorMode() {
  abortReflexRound();
  survivorState = 'idle';
  const io = ctx.getIo();
  io.emit('survivorAborted');
  io.emit('survivorState', { state: 'idle', eliminated: [], round: 0 });
}

// ─────────────────────────────────────────────
//  PUBLIC INTERFACE
// ─────────────────────────────────────────────
function start() {
  if (reflexState !== 'idle') return;
  runReflexRound();
}

function abort() { abortReflexRound(); }

function nextRound() {
  if (reflexState !== 'closed' || survivorState === 'playing') return;
  const io = ctx.getIo();
  reflexState = 'idle'; reflexBuzzes = []; reflexFalseStarts = []; reflexGoTime = null;
  io.emit('reflexState', { state: 'idle' });
  io.emit('reflexReset');
  ctx.lightsAll('IDLE');
}

function survivorStart() {
  if (survivorState !== 'idle') return;
  startSurvivorMode();
}

function survivorAbort() { abortSurvivorMode(); }

function survivorNext() {
  if (survivorState !== 'playing') return;
  runSurvivorRound();
}

function emitState(socket) {
  socket.emit('reflexState',   { state: reflexState });
  socket.emit('survivorState', { state: survivorState, eliminated: survivorEliminated, round: survivorRound });
}

module.exports = { init, handleBuzz, start, abort, nextRound, survivorStart, survivorAbort, survivorNext, emitState };
