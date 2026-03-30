'use strict';

let ctx = null;
let iterState       = 'idle';     // 'idle'|'waiting'|'running'|'closed'
let iterTimes       = [];         // [{id, ms}] — completed attempts in arrival order
let iterCurrent     = null;       // hexId of player currently being timed
let iterStartTime   = null;       // when current player's timer started
let iterScoringType = 'fastest';  // 'fastest'|'longest'|'amount'
let iterDuration    = 0;          // 0 = unlimited, >0 = per-player countdown in ms
let iterAutoStop    = null;       // setTimeout handle for auto-stop at zero

function init(context) { ctx = context; }

function clearAutoStop() {
  if (iterAutoStop) { clearTimeout(iterAutoStop); iterAutoStop = null; }
}

// Called from both MQTT buzz and socket.on('iterStartPlayer')
function startPlayer(id) {
  if (iterState !== 'waiting') return;
  const safeId = String(id).slice(0, 64);
  if (iterTimes.some(t => t.id === safeId)) { // already had a turn — push back to idle
    ctx.lightsOne(safeId, 'IDLE');
    return;
  }
  iterState = 'running'; iterCurrent = safeId; iterStartTime = Date.now();
  if (iterDuration > 0) {
    iterAutoStop = setTimeout(() => { if (iterState === 'running' && iterCurrent === safeId) stopPlayer(); }, iterDuration);
  }
  ctx.emitBuzzerOpen(false);
  ctx.lightsOne(safeId, 'WINNER');
  const io = ctx.getIo();
  io.emit('iterState',   { state: 'running', times: iterTimes, current: safeId, scoringType: iterScoringType, duration: iterDuration });
  io.emit('iterStarted', { id: safeId, startTime: iterStartTime, duration: iterDuration });
}

function handleBuzz(deviceId) { startPlayer(deviceId); }

function initRound(scoringType, duration) {
  if (iterState !== 'idle') return;
  iterScoringType = ['fastest', 'longest', 'amount'].includes(scoringType) ? scoringType : 'fastest';
  iterDuration = (Number(duration) > 0) ? Math.round(Number(duration) * 1000) : 0; // seconds → ms
  iterState = 'waiting'; iterTimes = []; iterCurrent = null; iterStartTime = null;
  ctx.emitBuzzerOpen(true);
  ctx.lightsAll('IDLE');
  ctx.getIo().emit('iterState', { state: 'waiting', times: iterTimes, current: null, scoringType: iterScoringType, duration: iterDuration });
}

function stopPlayer() {
  if (iterState !== 'running' || !iterCurrent) return;
  clearAutoStop();
  const ms = iterDuration > 0 ? Math.min(Date.now() - iterStartTime, iterDuration) : Date.now() - iterStartTime;
  iterTimes.push({ id: iterCurrent, ms });
  const stoppedId = iterCurrent;
  iterCurrent = null; iterStartTime = null; iterState = 'waiting';
  ctx.emitBuzzerOpen(true);
  ctx.lightsOne(stoppedId, 'IDLE');
  const io = ctx.getIo();
  io.emit('iterStopped', { id: stoppedId, ms });
  io.emit('iterState', { state: 'waiting', times: iterTimes, current: null, scoringType: iterScoringType });
}

function finish(amounts = []) {
  if (iterState !== 'waiting' || iterTimes.length === 0) return;
  closeIterRound(amounts);
}

function closeIterRound(amounts = []) {
  iterState = 'closed';
  const amountMap = Object.fromEntries(amounts.map(a => [String(a.id), Number(a.amount)]));
  let sorted;
  if (iterScoringType === 'longest') {
    sorted = [...iterTimes].sort((a, b) => b.ms - a.ms);
  } else if (iterScoringType === 'amount') {
    sorted = [...iterTimes].sort((a, b) => (amountMap[b.id] ?? 0) - (amountMap[a.id] ?? 0));
  } else {
    sorted = [...iterTimes].sort((a, b) => a.ms - b.ms); // fastest (default)
  }
  const multipliers = [3, 2, 1, 0];
  const awards = sorted.map((b, i) => {
    const mult = multipliers[i] ?? 0;
    const pts  = mult * ctx.getCurrentPoints();
    if (!(b.id in ctx.scores)) ctx.scores[b.id] = 0;
    ctx.scores[b.id] += pts;
    const entry = { id: b.id, ms: b.ms, position: i + 1, multiplier: mult, pts };
    if (iterScoringType === 'amount') entry.amount = amountMap[b.id] ?? null;
    return entry;
  });
  const io = ctx.getIo();
  io.emit('iterState',  { state: 'closed', times: iterTimes, current: null, scoringType: iterScoringType });
  io.emit('iterResult', { awards, scoringType: iterScoringType });
  io.emit('scoreUpdate', { scores: ctx.scores });
  ctx.getRoundHistory().push({ roundNum: ctx.incRoundCounter(), mode: 'itimer', timestamp: Date.now(), awards });
  io.emit('roundHistory', ctx.getRoundHistory());
  ctx.saveCheckpoint();
  console.info(`🏁  Iterative timer closed: ${awards.length} attempt(s). Winner: ${sorted[0]?.id ?? 'nobody'} (${((sorted[0]?.ms ?? 0) / 1000).toFixed(2)}s)`);
  if (awards[0]) ctx.lightsOne(awards[0].id, 'WINNER');
}

function abort() {
  clearAutoStop();
  if (iterState === 'running' && iterCurrent) {
    ctx.lightsOne(iterCurrent, 'IDLE');
  }
  iterState = 'idle'; iterTimes = []; iterCurrent = null; iterStartTime = null; iterScoringType = 'fastest';
  iterDuration = 0;
  ctx.emitBuzzerOpen(true);
  ctx.lightsAll('IDLE');
  console.info('🔄  Iterative timer aborted.');
  const io = ctx.getIo();
  io.emit('iterAborted');
  io.emit('iterState', { state: 'idle', times: [], current: null, scoringType: 'fastest' });
}

function nextRound() {
  if (iterState !== 'closed') return;
  clearAutoStop();
  iterState = 'idle'; iterTimes = []; iterCurrent = null; iterStartTime = null; iterScoringType = 'fastest';
  iterDuration = 0;
  const io = ctx.getIo();
  io.emit('iterState', { state: 'idle', times: [], current: null, scoringType: 'fastest' });
  io.emit('iterReset');
  ctx.lightsAll('IDLE');
}

function emitState(socket) {
  socket.emit('iterState', { state: iterState, times: iterTimes, current: iterCurrent, scoringType: iterScoringType, duration: iterDuration });
}

module.exports = { init, handleBuzz, initRound, startPlayer, stopPlayer, finish, abort, nextRound, emitState };
