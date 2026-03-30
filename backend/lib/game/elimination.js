'use strict';
const { ELIMINATION_WINDOW_MS } = require('../../constants');

let ctx = null;
let eliminationState  = 'idle';  // 'idle'|'open'|'closed'
let eliminationBuzzes = [];      // [{id, ts}] in arrival order
let eliminationTimer  = null;

function init(context) { ctx = context; }

function runEliminationRound() {
  eliminationState  = 'open';
  eliminationBuzzes = [];
  const io = ctx.getIo();
  io.emit('eliminationState',  { state: 'open', windowMs: ELIMINATION_WINDOW_MS });
  io.emit('eliminationWindow', { windowMs: ELIMINATION_WINDOW_MS });
  console.info(`💣  Elimination window open (${ELIMINATION_WINDOW_MS}ms)`);
  eliminationTimer = setTimeout(closeEliminationRound, ELIMINATION_WINDOW_MS);
}

function handleBuzz(deviceId) {
  if (eliminationState !== 'open') return;
  eliminationBuzzes = eliminationBuzzes.filter(b => b.id !== deviceId); // replace if pressed again
  eliminationBuzzes.push({ id: deviceId, ts: Date.now() });
  const io = ctx.getIo();
  io.emit('eliminationBuzz', { id: deviceId, count: eliminationBuzzes.length });
  console.info(`💣  Elimination buzz: ${deviceId} (${eliminationBuzzes.length} total)`);
}

function closeEliminationRound() {
  eliminationState = 'closed';
  const io = ctx.getIo();
  io.emit('eliminationState', { state: 'closed' });

  if (eliminationBuzzes.length === 0) {
    io.emit('eliminationResult', { awards: [], noBuzz: true });
    ctx.getRoundHistory().push({ roundNum: ctx.incRoundCounter(), mode: 'elimination', timestamp: Date.now(), awards: [], noBuzz: true });
    io.emit('roundHistory', ctx.getRoundHistory());
    return;
  }

  // Last buzz = winner; first buzz = loser (if >1 player)
  const winner = eliminationBuzzes[eliminationBuzzes.length - 1];
  const loser  = eliminationBuzzes.length > 1 ? eliminationBuzzes[0] : null;

  if (!(winner.id in ctx.scores)) ctx.scores[winner.id] = 0;
  ctx.scores[winner.id] += ctx.getCurrentPoints();

  if (loser) {
    if (!(loser.id in ctx.scores)) ctx.scores[loser.id] = 0;
    ctx.scores[loser.id] -= ctx.getCurrentPoints();
  }

  const awards = eliminationBuzzes.map((b, i) => {
    const isWinner = b.id === winner.id;
    const isLoser  = loser && b.id === loser.id;
    const pts = isWinner ? ctx.getCurrentPoints() : isLoser ? -ctx.getCurrentPoints() : 0;
    return { id: b.id, position: eliminationBuzzes.length - i, pts, tag: isWinner ? 'winner' : isLoser ? 'loser' : 'safe' };
  }).reverse();

  io.emit('eliminationResult', { awards });
  io.emit('scoreUpdate', { scores: ctx.scores });
  ctx.getRoundHistory().push({ roundNum: ctx.incRoundCounter(), mode: 'elimination', timestamp: Date.now(), awards });
  io.emit('roundHistory', ctx.getRoundHistory());
  ctx.saveCheckpoint();
  console.info(`💣  Elimination closed. Last: ${winner.id} (+${ctx.getCurrentPoints()}), First: ${loser?.id ?? '-'} (-${ctx.getCurrentPoints()})`);

  ctx.lightsAll('WINNER');
}

function abortEliminationRound() {
  clearTimeout(eliminationTimer);
  eliminationState  = 'idle';
  eliminationBuzzes = [];
  const io = ctx.getIo();
  io.emit('eliminationAborted');
  io.emit('eliminationState', { state: 'idle' });
}

function start()  { if (eliminationState !== 'idle') return; runEliminationRound(); }
function abort()  { abortEliminationRound(); }

function nextRound() {
  if (eliminationState !== 'closed') return;
  eliminationState = 'idle'; eliminationBuzzes = [];
  const io = ctx.getIo();
  io.emit('eliminationState', { state: 'idle' });
  io.emit('eliminationReset');
  ctx.lightsAll('IDLE');
}

function emitState(socket) {
  socket.emit('eliminationState', { state: eliminationState });
}

module.exports = { init, handleBuzz, start, abort, nextRound, emitState };
