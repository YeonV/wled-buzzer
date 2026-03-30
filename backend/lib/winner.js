/**
 * Winner detection, MQTT game loop, blade-lock penalties, and game reset.
 */
const mqtt = require('mqtt');
const state = require('./state');
const { PRESET, MQTT_PORT, LEDFX_PRESET } = require('../constants');
const wled = require('./wled');
const lfx  = require('./ledfx');
const { lightsAll, lightsOne, lightsMany } = require('./lights');

// Game modules
const reflex      = require('./game/reflex');
const precision   = require('./game/precision');
const elimination = require('./game/elimination');
const bomb        = require('./game/bomb');
const sportTimer  = require('./game/timer');
const iter        = require('./game/iter');
const pluginLoader = require('./pluginLoader');

let io = null;
function init(ctx) { io = ctx.getIo(); }

/** Calculate blade-lock escalating penalty */
function calcBladePenalty(count) {
  return count === 2 ? 100 : count === 3 ? 200 : count >= 4 ? 300 : 0;
}

/**
 * Extract the buzzer/client ID from an incoming MQTT message.
 * Returns null if this message should not trigger a winner event.
 */
function parseWinner(topic, message) {
  const parts = topic.split('/');
  if (parts[0] !== 'wled' || parts.length < 2 || parts.length > 3) return null;

  const clientId = parts[1];
  const subtopic = parts[2] ?? '(base)';
  const raw = message.toString().trim();

  if (raw === 'offline' || raw === 'online') return null;

  if (subtopic === 'status' || subtopic === '(base)') {
    try {
      const payload = JSON.parse(raw);
      const presetId = payload?.state?.ps ?? payload?.ps ?? null;
      if (presetId === null || presetId !== PRESET.PRESS) return null;
      return clientId;
    } catch {
      console.log(`[PARSE]  Not JSON on ${subtopic} — ignoring.`);
      return null;
    }
  }

  if (subtopic === 'v') {
    const psMatch = raw.match(/<ps>(\d+)<\/ps>/);
    if (!psMatch) return null;
    const presetId = parseInt(psMatch[1], 10);
    if (presetId !== PRESET.PRESS) return null;
    return clientId;
  }

  if (subtopic === 'g' || subtopic === 'c') return null;
  return null;
}

/** Handle a winner buzz in quiz mode */
async function handleWinner(winnerId) {
  if (!state.buzzerOpen) {
    const now = Date.now();
    if ((now - (state.idlePushThrottle.get(winnerId) ?? 0)) >= state.IDLE_PUSH_INTERVAL) {
      state.idlePushThrottle.set(winnerId, now);
      lightsOne(winnerId, 'IDLE');
    }
    const n = state.bladeLockCounts[winnerId] = (state.bladeLockCounts[winnerId] ?? 0) + 1;
    const name = state.displayNames[winnerId] || state.buzzerRoster.find(r => r.hexId === winnerId)?.name || winnerId;
    const penalty = calcBladePenalty(n);
    if (penalty > 0) {
      if (!(winnerId in state.scores)) state.scores[winnerId] = 0;
      state.scores[winnerId] -= penalty;
      console.info(`⚡  BladeLock #${n}: ${name} -${penalty} pts (total: ${state.scores[winnerId]})`);
      io.emit('scoreUpdate', { scores: state.scores });
    }
    io.emit('bladeLock', { id: winnerId, name, count: n, penalty });
    return;
  }
  state.gameLocked = true;
  state.buzzerOpen = false;
  io.emit('buzzerOpen', { open: false });
  console.info(`🏆  Buzz: ${winnerId} — waiting for verdict…`);

  io.emit('winner', { id: winnerId });

  lfx.ledfx(winnerId, LEDFX_PRESET.PRESS);
  const otherIds = state.buzzerRoster.filter(r => r.hexId !== winnerId).map(r => r.hexId);
  if (otherIds.length) lightsMany(otherIds, 'DIM');

  state.resetTimer = setTimeout(() => {
    console.info(`⏱️  Answer time limit reached for ${winnerId} — awaiting moderator verdict`);
    io.emit('autoWrongSignal', { winnerId });
  }, state.autoWrongMs);
}

/** Reset the game state for a new round */
async function resetGame() {
  io.emit('reset');
  io.emit('scoreUpdate', { scores: state.scores });

  state.showAnswer      = false;
  state.showAnswersOnly = false;
  state.answerReveal    = { chosenIndex: null, correctIndex: null };
  io.emit('showAnswer',      { show: false });
  io.emit('showAnswersOnly', { show: false });
  io.emit('answerReveal',    state.answerReveal);

  await lightsAll('IDLE');

  state.buzzerOpen = false;
  io.emit('buzzerOpen', { open: false });
  state.gameLocked = false;
  io.emit('gameState', { locked: false });
  Object.keys(state.bladeLockCounts).forEach(k => delete state.bladeLockCounts[k]);
  state.idlePushThrottle.clear();
}

/** Start the MQTT game loop — subscribes to buzzer topics and routes messages */
function startGameLogic() {
  const client = mqtt.connect(`mqtt://localhost:${MQTT_PORT}`);

  client.on('connect', async () => {
    console.info('✅  Game ready — waiting for buzzers.');
    client.subscribe('wled/+/status');
    client.subscribe('wled/+/g');
    client.subscribe('wled/#');
  });

  client.on('message', (topic, message) => {
    const deviceId = parseWinner(topic, message);
    if (!deviceId) return;

    // Setup phase: no roster yet
    if (state.buzzerRoster.length === 0) {
      io.emit('setupBuzz', { id: deviceId });
      wled.wledOne(deviceId, PRESET.IDLE).catch(() => {});
      return;
    }

    const resolvedDeviceId = state.hexIdToPlayer[deviceId] ?? deviceId;

    if (state.gameMode === 'reflex')      { reflex.handleBuzz(resolvedDeviceId);      return; }
    if (state.gameMode === 'precision')   { precision.handleBuzz(resolvedDeviceId);   return; }
    if (state.gameMode === 'elimination') { elimination.handleBuzz(resolvedDeviceId); return; }
    if (state.gameMode === 'bomb')        { bomb.handleBuzz(resolvedDeviceId);        return; }
    if (state.gameMode === 'survivor')    { reflex.handleBuzz(resolvedDeviceId);      return; }
    if (state.gameMode === 'timer')       { sportTimer.handleBuzz(resolvedDeviceId);  return; }
    if (state.gameMode === 'itimer')      { iter.handleBuzz(resolvedDeviceId);        return; }
    if (pluginLoader.routeBuzz(state.gameMode, resolvedDeviceId)) return;

    if (state.gameLocked) {
      console.log(`[GAME]   Locked — ignored.`);
      const n = state.bladeLockCounts[resolvedDeviceId] = (state.bladeLockCounts[resolvedDeviceId] ?? 0) + 1;
      const name = state.displayNames[resolvedDeviceId] || state.buzzerRoster.find(r => r.hexId === resolvedDeviceId)?.name || resolvedDeviceId;
      const penalty = calcBladePenalty(n);
      if (penalty > 0) {
        if (!(resolvedDeviceId in state.scores)) state.scores[resolvedDeviceId] = 0;
        state.scores[resolvedDeviceId] -= penalty;
        console.info(`⚡  BladeLock #${n}: ${name} -${penalty} pts (total: ${state.scores[resolvedDeviceId]})`);
        io.emit('scoreUpdate', { scores: state.scores });
      }
      io.emit('bladeLock', { id: resolvedDeviceId, name, count: n, penalty });
      return;
    }

    // Hint mode: reject buzz from locked-out players
    if (state.gameMode === 'hint' && state.lockedOutIds.includes(resolvedDeviceId)) {
      const name = state.displayNames[resolvedDeviceId] || state.buzzerRoster.find(r => r.hexId === resolvedDeviceId)?.name || resolvedDeviceId;
      console.info(`🔒  Hint lockout: ${name} already answered wrong — rejected`);
      io.emit('hintLockout', { id: resolvedDeviceId, name });
      lightsOne(resolvedDeviceId, 'LOSER');
      setTimeout(() => lightsOne(resolvedDeviceId, 'IDLE'), 800);
      return;
    }

    handleWinner(resolvedDeviceId);
  });

  client.on('error', (err) => {
    console.info(`⚠️  MQTT error: ${err.message}`);
  });
}

module.exports = { init, handleWinner, resetGame, startGameLogic, calcBladePenalty };
