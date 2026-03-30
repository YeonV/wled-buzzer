'use strict';

let ctx = null;
let bombState     = 'idle';   // 'idle'|'ticking'|'closed'
let bombDuration  = 10000;    // fuse length in ms (configurable)
let bombStartTime = null;
let bombBuzzes    = [];       // [{id, ms, remaining}]
let bombTimer     = null;

function init(context) { ctx = context; }

function runBombRound() {
  bombState    = 'ticking';
  bombBuzzes   = [];
  bombStartTime = Date.now();
  const io = ctx.getIo();
  io.emit('bombState',   { state: 'ticking', duration: bombDuration });
  io.emit('bombStarted', { duration: bombDuration });
  console.info(`💥  Bomb lit — ${bombDuration}ms fuse`);
  bombTimer = setTimeout(closeBombRound, bombDuration);
}

function handleBuzz(deviceId) {
  if (bombState !== 'ticking') return;
  if (bombBuzzes.some(b => b.id === deviceId)) return; // only first press counts
  const elapsed   = Date.now() - bombStartTime;
  const remaining = bombDuration - elapsed;
  if (remaining < 0) return; // just missed — treat as explode
  bombBuzzes.push({ id: deviceId, ms: elapsed, remaining });
  console.info(`💥  Bomb buzz: ${deviceId} at ${elapsed}ms (${remaining}ms left on fuse)`);
  ctx.getIo().emit('bombBuzz', { id: deviceId, ms: elapsed, remaining });
}

function closeBombRound() {
  clearTimeout(bombTimer);
  bombState = 'closed';
  const io = ctx.getIo();
  io.emit('bombState', { state: 'closed' });

  // Sort by remaining ascending — closest to zero = smallest remaining = winner
  const sorted = [...bombBuzzes].sort((a, b) => a.remaining - b.remaining);
  const awards = sorted.map((b, i) => {
    const ratio = Math.max(0, 1 - b.remaining / bombDuration);
    const pts   = i === 0 ? ctx.getCurrentPoints() : Math.round(ratio * ctx.getCurrentPoints() * 0.75);
    if (!(b.id in ctx.scores)) ctx.scores[b.id] = 0;
    ctx.scores[b.id] += pts;
    return { id: b.id, ms: b.ms, remaining: b.remaining, position: i + 1, pts };
  });

  io.emit('bombResult',  { awards, duration: bombDuration });
  io.emit('scoreUpdate', { scores: ctx.scores });
  ctx.getRoundHistory().push({ roundNum: ctx.incRoundCounter(), mode: 'bomb', timestamp: Date.now(), awards, duration: bombDuration });
  io.emit('roundHistory', ctx.getRoundHistory());
  ctx.saveCheckpoint();
  console.info(`💥  Bomb round closed. Winner: ${sorted[0]?.id ?? 'nobody'} (${sorted[0]?.remaining ?? '-'}ms left)`);

  if (sorted[0]) ctx.lightsOne(sorted[0].id, 'WINNER');
}

function abortBombRound() {
  clearTimeout(bombTimer);
  bombState  = 'idle';
  bombBuzzes = [];
  bombStartTime = null;
  const io = ctx.getIo();
  io.emit('bombAborted');
  io.emit('bombState', { state: 'idle' });
}

function start() { if (bombState !== 'idle') return; runBombRound(); }
function abort() { abortBombRound(); }

function setDuration(ms) {
  bombDuration = Math.max(3000, Math.min(60000, Number(ms)));
  ctx.getIo().emit('bombDuration', { ms: bombDuration });
}

function nextRound() {
  if (bombState !== 'closed') return;
  bombState = 'idle'; bombBuzzes = []; bombStartTime = null;
  const io = ctx.getIo();
  io.emit('bombState', { state: 'idle' });
  io.emit('bombReset');
  ctx.lightsAll('IDLE');
}

function emitState(socket) {
  socket.emit('bombDuration', { ms: bombDuration });
  socket.emit('bombState',    { state: bombState });
}

module.exports = { init, handleBuzz, start, abort, nextRound, setDuration, emitState };
