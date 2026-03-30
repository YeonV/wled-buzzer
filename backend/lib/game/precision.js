'use strict';
const { REFLEX_COUNTDOWN_STEP_MS } = require('../../constants');

let ctx = null;
let precisionState   = 'idle';  // 'idle'|'countdown'|'waiting'|'closed'
let precisionTarget  = 5000;    // target ms (configurable from UI)
let precisionCueTime = null;    // when the cue fired
let precisionBuzzes  = [];      // [{id, ms, error}]
let precisionTimer   = null;

function init(context) { ctx = context; }

async function runPrecisionRound() {
  precisionState  = 'countdown';
  precisionBuzzes = [];
  precisionCueTime = null;
  const io = ctx.getIo();
  io.emit('precisionState', { state: 'countdown' });

  for (let i = 3; i >= 1; i--) {
    io.emit('precisionCountdown', { count: i });
    await ctx.sleep(REFLEX_COUNTDOWN_STEP_MS);
    if (precisionState !== 'countdown') return; // aborted
  }

  precisionState   = 'waiting';
  precisionCueTime = Date.now();
  io.emit('precisionState', { state: 'waiting' });
  io.emit('precisionCue');

  // Auto-close after 3× the target (nobody buzzed)
  precisionTimer = setTimeout(closePrecisionRound, precisionTarget * 3);
}

function handleBuzz(deviceId) {
  if (precisionState !== 'waiting') return;
  if (precisionBuzzes.some(b => b.id === deviceId)) return;
  const ms    = Date.now() - precisionCueTime;
  const error = Math.abs(ms - precisionTarget);
  precisionBuzzes.push({ id: deviceId, ms, error });
  console.info(`⏱️  Precision buzz: ${deviceId} at ${ms}ms (target ${precisionTarget}ms, error ${error}ms)`);
  const io = ctx.getIo();
  io.emit('precisionBuzz', { id: deviceId, ms, error, target: precisionTarget });

  // All roster players have buzzed — close early
  const activeIds = ctx.getBuzzerRoster().map(r => r.hexId);
  const allIn = activeIds.every(id => precisionBuzzes.some(b => b.id === id));
  if (allIn) { clearTimeout(precisionTimer); closePrecisionRound(); }
}

function closePrecisionRound() {
  clearTimeout(precisionTimer);
  precisionState = 'closed';
  const io = ctx.getIo();
  io.emit('precisionState', { state: 'closed' });

  // Sort by error ascending — lowest error wins
  const sorted = [...precisionBuzzes].sort((a, b) => a.error - b.error);
  const awards = sorted.map((b, i) => {
    const ratio = Math.max(0, 1 - b.error / precisionTarget);
    const pts   = i === 0 ? ctx.getCurrentPoints() : Math.round(ratio * ctx.getCurrentPoints() * 0.6);
    if (!(b.id in ctx.scores)) ctx.scores[b.id] = 0;
    ctx.scores[b.id] += pts;
    return { id: b.id, ms: b.ms, error: b.error, position: i + 1, pts };
  });

  io.emit('precisionResult', { awards, target: precisionTarget });
  io.emit('scoreUpdate', { scores: ctx.scores });
  ctx.getRoundHistory().push({ roundNum: ctx.incRoundCounter(), mode: 'precision', timestamp: Date.now(), awards, target: precisionTarget });
  io.emit('roundHistory', ctx.getRoundHistory());
  ctx.saveCheckpoint();
  console.info(`🎯  Precision round closed. Winner: ${sorted[0]?.id ?? 'nobody'} (error ${sorted[0]?.error ?? '-'}ms)`);

  if (sorted[0]) ctx.lightsOne(sorted[0].id, 'WINNER');
}

function abortPrecisionRound() {
  clearTimeout(precisionTimer);
  precisionState  = 'idle';
  precisionBuzzes = [];
  precisionCueTime = null;
  const io = ctx.getIo();
  io.emit('precisionAborted');
  io.emit('precisionState', { state: 'idle' });
}

function start()  { if (precisionState !== 'idle') return; runPrecisionRound(); }
function abort()  { abortPrecisionRound(); }

function nextRound() {
  if (precisionState !== 'closed') return;
  precisionState = 'idle'; precisionBuzzes = []; precisionCueTime = null;
  const io = ctx.getIo();
  io.emit('precisionState', { state: 'idle' });
  io.emit('precisionReset');
  ctx.lightsAll('IDLE');
}

function setTarget(ms) {
  precisionTarget = Math.max(1000, Math.min(30000, Number(ms)));
  ctx.getIo().emit('precisionTarget', { ms: precisionTarget });
}

function emitState(socket) {
  socket.emit('precisionTarget', { ms: precisionTarget });
  socket.emit('precisionState',  { state: precisionState });
}

module.exports = { init, handleBuzz, start, abort, nextRound, setTarget, emitState };
