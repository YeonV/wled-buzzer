const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const https = require('https');

// ─── Paths ──────────────────────────────────────────────────────────────────
const STATIC_DIR = process.pkg
  ? path.join(path.dirname(process.execPath), 'public')
  : path.join(__dirname, '..', 'frontend', 'dist');
const RESULTS_DIR = process.pkg
  ? path.join(path.dirname(process.execPath), 'results')
  : path.join(__dirname, '..', 'results');
const UPLOADS_DIR = process.pkg
  ? path.join(path.dirname(process.execPath), 'public', 'uploads')
  : path.join(__dirname, '..', 'frontend', 'public', 'uploads');
const LOOP_NAMES_PATH = process.pkg
  ? path.join(path.dirname(process.execPath), 'loop-names.json')
  : path.join(__dirname, 'loop-names.json');

const state = require('./lib/state');
const { MQTT_PORT, WS_PORT, PRESET, LEDFX_PRESET, LEDFX_ALL_IDS, LEDFX_URL } = require('./constants');
const wled = require('./lib/wled');
const lfx  = require('./lib/ledfx');
const { lightsAll, lightsOne } = require('./lib/lights');
const { sleep } = require('./lib/utils');
const { registerRoutes } = require('./lib/routes');
const { createBroker }   = require('./lib/mqtt-broker');
const quiz      = require('./lib/quiz');
const setupSync = require('./lib/setup-sync');
const winner    = require('./lib/winner');
const reflex      = require('./lib/game/reflex');
const precision   = require('./lib/game/precision');
const elimination = require('./lib/game/elimination');
const bomb        = require('./lib/game/bomb');
const sportTimer  = require('./lib/game/timer');
const iter        = require('./lib/game/iter');
const pluginLoader = require('./lib/pluginLoader');

// ─── Express setup ──────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '12mb' }));

// ─── Ensure packs dir + active-packs.json exist on first run ────────────────
const PACKS_DIR = path.join(UPLOADS_DIR, 'packs');
(function ensurePacks() {
  const defaultDir = path.join(PACKS_DIR, 'default', 'questions');
  fs.mkdirSync(defaultDir, { recursive: true });
  const defaultQ = path.join(defaultDir, 'questions.json');
  if (!fs.existsSync(defaultQ)) fs.writeFileSync(defaultQ, '[]', 'utf8');
  if (!fs.existsSync(state.ACTIVE_PACKS_PATH))
    fs.writeFileSync(state.ACTIVE_PACKS_PATH, JSON.stringify({ avatars: 'default', questions: 'default' }, null, 2), 'utf8');
})();

// ─── Serve active pack's questions.json BEFORE static middleware ─────────────
app.get('/questions.json', async (req, res, next) => {
  try {
    const active = JSON.parse(await fs.promises.readFile(state.ACTIVE_PACKS_PATH, 'utf8'));
    const qName = active.questions || 'default';
    const found = await _findQuestionsJson(qName);
    if (found) return res.sendFile(found);
  } catch { /* fall through */ }
  next();
});

async function _findQuestionsJson(name, searchDir) {
  const dirs = searchDir ? [searchDir] : [state.PACKS_DIR, state.CUSTOM_PACKS_DIR];
  for (const dir of dirs) {
    if (!dir) continue;
    const direct = path.join(dir, name, 'questions', 'questions.json');
    try { await fs.promises.access(direct); return direct; } catch {}
    // Recurse into subdirectories that aren't packs themselves
    try {
      for (const entry of await fs.promises.readdir(dir)) {
        const full = path.join(dir, entry);
        const stat = await fs.promises.stat(full);
        if (!stat.isDirectory()) continue;
        const hasPack = await fs.promises.access(path.join(full, 'pack.json')).then(() => true, () => false);
        if (!hasPack) {
          const found = await _findQuestionsJson(name, full);
          if (found) return found;
        }
      }
    } catch {}
  }
  return null;
}

app.use(express.static(STATIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/custom-packs', express.static(state.CUSTOM_PACKS_DIR));

// ─── Silence debug noise in production (.exe) ──────────────────────────────
if (process.pkg) {
  console.log   = () => {};
  console.warn  = () => {};
  console.error = () => {};
}

// ─── Wire up lib state getters ──────────────────────────────────────────────
wled.init({ getBuzzerRoster: () => state.buzzerRoster, getMqttMap: () => state.mqttClientIpMap });
lfx.init({ getBuzzerRoster: () => state.buzzerRoster });

// ─── HTTP/S + Socket.IO ─────────────────────────────────────────────────────
const CERT_DIR = process.pkg
  ? path.join(path.dirname(process.execPath), 'certs')
  : path.join(__dirname, '..', 'certs');
const certFile = path.join(CERT_DIR, 'cert.pem');
const keyFile  = path.join(CERT_DIR, 'key.pem');
const useTLS = fs.existsSync(certFile) && fs.existsSync(keyFile);
const server = useTLS
  ? https.createServer({ cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }, app)
  : http.createServer(app);
const protocol = useTLS ? 'https' : 'http';

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

registerRoutes(app, { getIo: () => io, resetQuestionIndex: () => { state.questionIndex = 0; }, LEDFX_URL, LOOP_NAMES_PATH, RESULTS_DIR, UPLOADS_DIR, STATIC_DIR, ACTIVE_PACKS_PATH: state.ACTIVE_PACKS_PATH, CUSTOM_PACKS_DIR: state.CUSTOM_PACKS_DIR });

// ─── Game module wiring ─────────────────────────────────────────────────────
const gameCtx = {
  getIo:            () => io,
  scores:           state.scores,
  getCurrentPoints: () => state.currentPoints,
  getBuzzerRoster:  () => state.buzzerRoster,
  getRoundHistory:  () => state.roundHistory,
  incRoundCounter:  () => ++state.roundCounter,
  lightsAll, lightsOne, sleep,
  emitBuzzerOpen:   (v) => { state.buzzerOpen = v; io.emit('buzzerOpen', { open: v }); },
  saveCheckpoint:   () => state.saveCheckpoint(),
};
reflex.init(gameCtx);
precision.init(gameCtx);
elimination.init(gameCtx);
bomb.init(gameCtx);
sportTimer.init(gameCtx);
iter.init(gameCtx);

// Init plugins (auto-discovered from plugins/ directory)
pluginLoader.loadAll();
pluginLoader.initAll(gameCtx);

// Init extracted modules
quiz.init({ getIo: () => io });
setupSync.init({ getIo: () => io });
winner.init({ getIo: () => io });

// ─── Restore game state from checkpoint (crash recovery) ────────────────
state.loadCheckpoint();

// Startup probe — informational only
setTimeout(() => lfx.probe(), 3000);

server.listen(WS_PORT, () => {
  console.info(`🚀  WLED Buzzer running  →  ${protocol}://localhost:${WS_PORT}`);
  if (process.pkg) exec(`start ${protocol}://localhost:${WS_PORT}`);
});

// ─── Socket.IO connection handler ───────────────────────────────────────────
io.on('connection', (socket) => {
  // ── Initial state sync ──────────────────────────────────────────────────
  emitFullState(socket);

  socket.on('requestState', () => emitFullState(socket));

  // ── Core game controls ──────────────────────────────────────────────────
  socket.on('setBuzzerOpen', ({ open }) => {
    state.buzzerOpen = !!open;
    io.emit('buzzerOpen', { open: state.buzzerOpen });
    console.info(`🔒  Buzzers ${state.buzzerOpen ? 'opened' : 'locked'}`);
  });

  socket.on('manualReset', () => {
    clearTimeout(state.resetTimer);
    winner.resetGame();
  });

  socket.on('endGame', () => {
    state.reset();
    state.deleteCheckpoint();
    console.info('🏁  Game ended — returning to setup');
    io.emit('gameEnded');
    io.sockets.sockets.forEach(s => emitFullState(s));
  });

  socket.on('setAutoWrong', ({ ms }) => {
    state.autoWrongMs = Math.max(1000, Math.min(60000, Number(ms)));
    io.emit('autoWrongMs', { ms: state.autoWrongMs });
  });

  socket.on('setPoints', ({ points }) => {
    state.currentPoints = Math.max(0, Number(points));
  });

  socket.on('setGameMode', ({ mode }) => {
    state.gameMode = mode;
    io.emit('gameMode', { mode });
  });

  // ── Theme / UI settings ─────────────────────────────────────────────────
  socket.on('setTheme', ({ theme }) => {
    state.currentTheme = String(theme).slice(0, 32);
    io.emit('theme', { theme: state.currentTheme });
  });

  socket.on('setScoreboardPos', ({ pos }) => {
    state.currentScoreboardPos = String(pos).slice(0, 32);
    io.emit('scoreboardPos', { pos: state.currentScoreboardPos });
  });

  socket.on('setScoreboardActiveOnly', ({ active }) => {
    state.currentScoreboardActiveOnly = !!active;
    io.emit('scoreboardActiveOnly', { active: state.currentScoreboardActiveOnly });
  });

  socket.on('setScoreboardVariant', ({ variant }) => {
    state.currentScoreboardVariant = String(variant).slice(0, 32);
    io.emit('scoreboardVariant', { variant: state.currentScoreboardVariant });
  });

  socket.on('setScoreboardTopN', ({ topN }) => {
    state.currentScoreboardTopN = Math.max(0, Math.min(50, Number(topN) || 0));
    io.emit('scoreboardTopN', { topN: state.currentScoreboardTopN });
  });

  socket.on('setScoreboardShowGaps', ({ showGaps }) => {
    state.currentScoreboardShowGaps = !!showGaps;
    io.emit('scoreboardShowGaps', { showGaps: state.currentScoreboardShowGaps });
  });

  socket.on('setAvatarSettings', ({ size, variant, imageStyle }) => {
    try {
      const s = Math.max(8, Math.min(128, Number(size) || state.currentAvatarSettings.size));
      const v = variant === 'filled' ? 'filled' : 'outlined';
      state.currentAvatarSettings = { size: s, variant: v };
      if (imageStyle === 'plain' || imageStyle === 'rounded' || imageStyle === 'circle') state.currentAvatarSettings.imageStyle = imageStyle;
      io.emit('avatarSettings', state.currentAvatarSettings);
      (async () => {
        try {
          const asp = state.avatarSettingsPath();
          await fs.promises.mkdir(path.dirname(asp), { recursive: true });
          await fs.promises.writeFile(asp, JSON.stringify(state.currentAvatarSettings, null, 2), 'utf8');
        } catch (err) {
          console.error('Failed to persist avatar settings:', err?.message || err);
        }
      })();
    } catch (e) {
      console.error('Invalid avatar settings:', e?.message || e);
    }
  });

  socket.on('setLang', ({ lang }) => {
    const ALLOWED = ['en', 'de'];
    state.currentLang = ALLOWED.includes(lang) ? lang : 'en';
    io.emit('lang', { lang: state.currentLang });
  });

  // ── Team management ────────────────────────────────────────────────────
  socket.on('shuffleTeams', ({ count, names }) => {
    const roster = state.buzzerRoster.filter(r => r.hexId in state.displayNames || state.scores[r.hexId] !== undefined);
    const playerIds = roster.length > 0 ? roster.map(r => r.hexId) : Object.keys(state.displayNames);
    if (playerIds.length === 0) return;

    const teamCount = Math.max(2, Math.min(8, Number(count) || 4));
    // Fisher-Yates shuffle
    const shuffled = [...playerIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const assignments = {};
    shuffled.forEach((id, i) => { assignments[id] = i % teamCount; });

    const DEFAULT_COLORS = [[66,133,244],[234,67,53],[251,188,4],[52,168,83],[171,71,188],[255,112,67],[0,172,193],[124,179,66]];
    const defaultNames = Array.from({ length: teamCount }, (_, i) => `Team ${i + 1}`);
    const teamNames = Array.isArray(names) && names.length >= teamCount ? names.slice(0, teamCount) : defaultNames;
    const teamColors = DEFAULT_COLORS.slice(0, teamCount);

    state.teamAssignments = assignments;
    state.teamNames = teamNames;
    state.teamColors = teamColors;
    state.teamMode = true;
    io.emit('teamState', { assignments, names: teamNames, colors: teamColors, active: true });
    state.saveCheckpoint();
    console.info(`👥  Teams shuffled: ${teamCount} teams, ${playerIds.length} players`);
  });

  socket.on('setTeamMode', ({ active }) => {
    state.teamMode = !!active;
    io.emit('teamState', { assignments: state.teamAssignments, names: state.teamNames, colors: state.teamColors, active: state.teamMode });
  });

  socket.on('clearTeams', () => {
    state.teamAssignments = {};
    state.teamNames = [];
    state.teamColors = [];
    state.teamMode = false;
    io.emit('teamState', { assignments: {}, names: [], colors: [], active: false });
    state.saveCheckpoint();
  });

  socket.on('awardTeamPoints', ({ teamPointsMap }) => {
    // teamPointsMap: { teamIndex: points } — distribute to all team members
    if (!teamPointsMap || !state.teamMode) return;
    for (const [playerId, teamIdx] of Object.entries(state.teamAssignments)) {
      const pts = teamPointsMap[teamIdx];
      if (pts !== undefined && pts !== 0) {
        if (!(playerId in state.scores)) state.scores[playerId] = 0;
        state.scores[playerId] += Number(pts);
      }
    }
    io.emit('scoreUpdate', { scores: state.scores });
    state.saveCheckpoint();
  });

  // ── Game mode socket handlers ───────────────────────────────────────────
  socket.on('startReflex',     () => reflex.start());
  socket.on('abortReflex',     () => reflex.abort());
  socket.on('nextReflexRound', () => reflex.nextRound());

  socket.on('startPrecision',     () => precision.start());
  socket.on('abortPrecision',     () => precision.abort());
  socket.on('nextPrecisionRound', () => precision.nextRound());
  socket.on('setPrecisionTarget', ({ ms }) => precision.setTarget(ms));

  socket.on('startElimination',     () => elimination.start());
  socket.on('abortElimination',     () => elimination.abort());
  socket.on('nextEliminationRound', () => elimination.nextRound());

  socket.on('startBomb',     () => bomb.start());
  socket.on('abortBomb',     () => bomb.abort());
  socket.on('nextBombRound', () => bomb.nextRound());
  socket.on('setBombDuration', ({ ms }) => bomb.setDuration(ms));

  // Plugin socket handlers (auto-registered)
  pluginLoader.registerSocketHandlers(socket);

  socket.on('startSurvivor',     () => reflex.survivorStart());
  socket.on('abortSurvivor',     () => reflex.survivorAbort());
  socket.on('survivorNextRound', () => reflex.survivorNext());

  socket.on('startTimer',     ({ scoringType, duration } = {}) => sportTimer.start(scoringType, duration));
  socket.on('abortTimer',     () => sportTimer.abort());
  socket.on('closeTimer',     () => sportTimer.close());
  socket.on('nextTimerRound', () => sportTimer.nextRound());

  socket.on('startIter',       ({ scoringType, duration } = {}) => iter.initRound(scoringType, duration));
  socket.on('iterStartPlayer', ({ id }) => iter.startPlayer(id));
  socket.on('iterStopPlayer',  () => iter.stopPlayer());
  socket.on('iterFinish',      ({ amounts } = {}) => iter.finish(Array.isArray(amounts) ? amounts : []));
  socket.on('abortIter',       () => iter.abort());
  socket.on('nextIterRound',   () => iter.nextRound());

  // ── WLED controls ───────────────────────────────────────────────────────
  socket.on('wledIdle',  () => lightsAll('IDLE'));
  socket.on('wledPress', () => wled.wledAll(PRESET.PRESS).catch(() => {}));

  socket.on('wledBrightness', async ({ bri }) => {
    await wled.wledBri(bri);
    const color = bri > 0 ? '#ff1493' : '#000000';
    const bIds = [...new Set(state.buzzerRoster.flatMap(r => lfx.ledfxIds(r.hexId)).filter(Boolean))];
    lfx.ledfxApply(bIds.length ? bIds : LEDFX_ALL_IDS, 'singleColor', { color });
  });

  // ── Score management ────────────────────────────────────────────────────
  socket.on('resetScores', () => {
    Object.keys(state.scores).forEach(k => delete state.scores[k]);
    io.emit('scoreUpdate', { scores: state.scores });
  });

  socket.on('setScores', (newScores) => {
    if (typeof newScores !== 'object' || newScores === null) return;
    Object.keys(state.scores).forEach(k => delete state.scores[k]);
    for (const [k, v] of Object.entries(newScores)) {
      state.scores[k] = Number.isFinite(Number(v)) ? Number(v) : 0;
    }
    io.emit('scoreUpdate', { scores: state.scores });
  });

  socket.on('setDisplayNames', (names) => {
    if (typeof names !== 'object' || names === null) return;
    Object.keys(state.displayNames).forEach(k => delete state.displayNames[k]);
    for (const [k, v] of Object.entries(names)) {
      if (typeof v === 'string') state.displayNames[k] = v;
    }
    io.emit('displayNames', { names: state.displayNames });
  });

  socket.on('testBuzz', ({ deviceId }) => {
    if (state.gameLocked || !state.buzzerOpen) return;
    const rawId = deviceId || 'test-device';
    const id = state.hexIdToPlayer[rawId] ?? rawId;
    winner.handleWinner(id);
  });

  // ── Delegated modules ───────────────────────────────────────────────────
  quiz.registerHandlers(socket, { resultsDir: RESULTS_DIR });
  setupSync.registerHandlers(socket);

  // ── Emit game-mode state to new connection ──────────────────────────────
  reflex.emitState(socket);
  precision.emitState(socket);
  elimination.emitState(socket);
  bomb.emitState(socket);
  sportTimer.emitState(socket);
  iter.emitState(socket);
  pluginLoader.emitStateAll(socket);
  quiz.emitState(socket);
  setupSync.emitState(socket);
});

/** Emit all shared state to a socket (used on connect + requestState) */
function emitFullState(socket) {
  socket.emit('gameState',     { locked: state.gameLocked });
  socket.emit('buzzerOpen',    { open: state.buzzerOpen });
  socket.emit('scoreUpdate',   { scores: state.scores });
  socket.emit('displayNames',  { names: state.displayNames });
  socket.emit('autoWrongMs',   { ms: state.autoWrongMs });
  socket.emit('currentPoints', { points: state.currentPoints });
  socket.emit('gameMode',      { mode: state.gameMode });
  if (Object.keys(state.auraState).length > 0) socket.emit('auraState', state.auraState);
  socket.emit('theme',                  { theme: state.currentTheme });
  socket.emit('scoreboardPos',          { pos: state.currentScoreboardPos });
  socket.emit('scoreboardActiveOnly',   { active: state.currentScoreboardActiveOnly });
  socket.emit('scoreboardVariant',      { variant: state.currentScoreboardVariant });
  socket.emit('scoreboardTopN',        { topN: state.currentScoreboardTopN });
  socket.emit('scoreboardShowGaps',    { showGaps: state.currentScoreboardShowGaps });
  socket.emit('lang',                   { lang: state.currentLang });
  socket.emit('avatarSettings',         state.currentAvatarSettings);
  if (state.buzzerRoster.length > 0) socket.emit('buzzerRoster', state.buzzerRoster);
  if (state.teamMode || Object.keys(state.teamAssignments).length > 0) {
    socket.emit('teamState', { assignments: state.teamAssignments, names: state.teamNames, colors: state.teamColors, active: state.teamMode });
  }
}

// ─── MQTT Broker ────────────────────────────────────────────────────────────
const { tcpServer } = createBroker({ getIo: () => io, mqttClientIpMap: state.mqttClientIpMap, mqttClientNameMap: state.mqttClientNameMap });

tcpServer.listen(MQTT_PORT, () => {
  winner.startGameLogic();
});
