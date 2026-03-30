'use strict';
const { REFLEX_COUNTDOWN_STEP_MS } = require('../../constants');

let ctx = null;
let timerState       = 'idle';     // 'idle'|'countdown'|'running'|'closed'
let timerBuzzes      = [];         // [{id, ms}] ordered by arrival
let timerStartTime   = null;
let timerScoringType = 'fastest';  // 'fastest'|'longest'
let timerDuration    = 0;          // 0 = unlimited, >0 = countdown in ms
let timerDeadline    = null;       // Date.now() + timerDuration (when counting down)
let timerAutoClose   = null;       // setTimeout handle for auto-close at zero

function init(context) { ctx = context; }

async function runTimerRound() {
  timerState    = 'countdown';
  timerBuzzes   = [];
  timerStartTime = null;
  timerDeadline  = null;
  const io = ctx.getIo();
  io.emit('timerState', { state: 'countdown' });

  for (let i = 3; i >= 1; i--) {
    io.emit('timerCountdown', { count: i });
    await ctx.sleep(REFLEX_COUNTDOWN_STEP_MS);
    if (timerState !== 'countdown') return; // aborted mid-countdown
  }

  timerState     = 'running';
  timerStartTime = Date.now();
  if (timerDuration > 0) {
    timerDeadline = timerStartTime + timerDuration;
    timerAutoClose = setTimeout(() => { if (timerState === 'running') closeTimerRound(); }, timerDuration);
  }
  ctx.emitBuzzerOpen(true);
  io.emit('timerState',   { state: 'running', duration: timerDuration });
  io.emit('timerStarted', { startTime: timerStartTime, duration: timerDuration });
}

function handleBuzz(deviceId) {
  if (timerState !== 'running') return;
  if (timerBuzzes.some(b => b.id === deviceId)) return; // one buzz per team
  const ms  = Date.now() - timerStartTime;
  timerBuzzes.push({ id: deviceId, ms });
  const pos = timerBuzzes.length;
  console.info(`🏃  Timer buzz #${pos}: ${deviceId} (${ms}ms)`);
  const io = ctx.getIo();
  io.emit('timerBuzz', { id: deviceId, ms, position: pos });

  // Auto-close once every rostered team has buzzed
  const activeIds = ctx.getBuzzerRoster().map(r => r.hexId);
  const allIn = activeIds.length > 0 && activeIds.every(id => timerBuzzes.some(b => b.id === id));
  if (allIn) closeTimerRound();
}

function closeTimerRound() {
  timerState = 'closed';
  ctx.emitBuzzerOpen(false);
  const io = ctx.getIo();
  io.emit('timerState', { state: 'closed', scoringType: timerScoringType });

  const multipliers = [3, 2, 1, 0];
  // For 'longest', the last buzzer wins — reverse the scoring order
  const ordered = timerScoringType === 'longest' ? [...timerBuzzes].reverse() : timerBuzzes;
  const awards = ordered.map((b, i) => {
    const mult = multipliers[i] ?? 0;
    const pts  = mult * ctx.getCurrentPoints();
    if (!(b.id in ctx.scores)) ctx.scores[b.id] = 0;
    ctx.scores[b.id] += pts;
    return { id: b.id, ms: b.ms, position: timerBuzzes.indexOf(b) + 1, multiplier: mult, pts };
  });

  io.emit('timerResult', { awards });
  io.emit('scoreUpdate', { scores: ctx.scores });
  ctx.getRoundHistory().push({ roundNum: ctx.incRoundCounter(), mode: 'timer', timestamp: Date.now(), awards });
  io.emit('roundHistory', ctx.getRoundHistory());
  ctx.saveCheckpoint();
  console.info(`🏁  Timer round closed: ${awards.length} finisher(s).`);

  if (awards[0]) ctx.lightsOne(awards[0].id, 'WINNER');
}

function clearAutoClose() {
  if (timerAutoClose) { clearTimeout(timerAutoClose); timerAutoClose = null; }
}

function abortTimerRound() {
  clearAutoClose();
  timerState       = 'idle';
  timerBuzzes      = [];
  timerStartTime   = null;
  timerScoringType = 'fastest';
  timerDuration    = 0;
  timerDeadline    = null;
  ctx.emitBuzzerOpen(false);
  console.info('🔄  Timer round aborted.');
  const io = ctx.getIo();
  io.emit('timerAborted');
  io.emit('timerState', { state: 'idle', scoringType: 'fastest' });
}

function start(scoringType, duration) {
  if (timerState !== 'idle') return;
  timerScoringType = scoringType === 'longest' ? 'longest' : 'fastest';
  timerDuration = (Number(duration) > 0) ? Math.round(Number(duration) * 1000) : 0; // seconds → ms
  runTimerRound();
}
function abort()  { abortTimerRound(); }
function close()  { clearAutoClose(); if (timerState === 'running') closeTimerRound(); }

function nextRound() {
  if (timerState !== 'closed') return;
  clearAutoClose();
  timerState = 'idle'; timerBuzzes = []; timerStartTime = null; timerScoringType = 'fastest';
  timerDuration = 0; timerDeadline = null;
  const io = ctx.getIo();
  io.emit('timerState', { state: 'idle', scoringType: 'fastest' });
  io.emit('timerReset');
  ctx.lightsAll('IDLE');
}

function emitState(socket) {
  socket.emit('timerState', { state: timerState, scoringType: timerScoringType, duration: timerDuration });
}

module.exports = { init, handleBuzz, start, abort, close, nextRound, emitState };
