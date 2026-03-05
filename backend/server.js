const aedes = require('aedes')();
const net = require('net');
const os  = require('os');
const path = require('path');
const { exec } = require('child_process');
const mqtt = require('mqtt');
const axios = require('axios');
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');

// ─── Serve built frontend (works as plain node and as pkg .exe) ──────────────
const STATIC_DIR = process.pkg
  ? path.join(path.dirname(process.execPath), 'public')
  : path.join(__dirname, '..', 'frontend', 'dist');
const app = express();
app.use(express.static(STATIC_DIR));
app.get('*', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));

// ─── In production (.exe) silence debug noise; only console.info shows ────────
if (process.pkg) {
  console.log   = () => {};
  console.warn  = () => {};
  console.error = () => {};
}

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const MQTT_PORT = 1883;
const WS_PORT   = 3001;



/**
 * WLED Preset IDs — created automatically on server start via setupPresets().
 *   1 = PRESS  — white burst  (WLED fires this itself when button is pressed)
 *   2 = WINNER — solid green
 *   3 = LOSER  — solid red
 *   4 = IDLE   — breathing blue
 *
 * Key insight: after we recall preset 2/3/4, WLED remembers that ps value.
 * So any reconnect burst will report ps=2/3/4, never ps=1.
 * Therefore ps=1 on /v can ONLY mean a real button press — no debounce needed.
 */
const PRESET = { PRESS: 1, WINNER: 2, LOSER: 3, IDLE: 4 };

const PRESET_DEFS = [
  { id: 1, n: 'Press',  state: { on: true, bri: 255, seg: [{ fx: 9,  sx: 200, col: [[255,255,255]] }] } }, // Blink fx
  { id: 2, n: 'Winner', state: { on: true, bri: 255, seg: [{ fx: 0,  col: [[0,220,80]]           }] } }, // Solid green
  { id: 3, n: 'Loser',  state: { on: true, bri: 255, seg: [{ fx: 0,  col: [[255,30,0]]            }] } }, // Solid red
  { id: 4, n: 'Idle',   state: { on: true, bri: 128, seg: [{ fx: 65, sx: 30, col: [[0,80,255]]   }] } }, // Breathing blue (fx 65)
];

let autoWrongMs = 5000; // ms with no judge call before auto-wrong triggers (configurable from UI)

// ── Timings (ms) — all magic numbers live here ───────────────────────────────
const RESET_DELAY_MS           = 1500; // pause after verdict before next round starts
const REFLEX_COLLECT_MS        = 3000; // window after GO to accept buzzes
const REFLEX_RESULTS_MS        = 6000; // how long the results screen shows before returning to idle
const REFLEX_COUNTDOWN_STEP_MS = 1000; // duration of each 3-2-1 countdown beat
const REFLEX_FLASH_MIN_MS      =  400; // minimum distractor flash duration
const REFLEX_FLASH_RANGE_MS    =  800; // random extra added on top (so 400–1200ms total)
const PRESET_SAVE_DELAY_MS     =  600; // gap between preset saves to let WLED write to flash
const WLED_TIMEOUT_MS          = 1500; // axios timeout for normal WLED JSON API calls
const SETUP_TIMEOUT_MS         = 4000; // axios timeout during initial preset setup (flash write is slow)

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let gameLocked = false;
let resetTimer  = null;
const scores    = {}; // { [deviceId]: number }

// ── Buzzer roster — populated dynamically from SetupScreen ──────────────────
// Each entry: { hexId, ip, name }  —  only active/selected buzzers for this game.
// Empty until the UI sends setBuzzerRoster; wledAll is a no-op while empty.
let buzzerRoster = [];
let currentPoints = 100; // points stake per round, synced from UI

// ── Reflex mode ──────────────────────────────────────────────────────────────
let gameMode          = 'quiz';  // 'quiz' | 'reflex'
let reflexState       = 'idle';  // 'idle'|'countdown'|'sequence'|'go'|'closed'
let reflexBuzzes      = [];      // [{id, ms}] ordered by arrival
let reflexFalseStarts = [];      // [id] — buzzed before GO signal
let reflexGoTime      = null;
let reflexSeqTimer    = null;
const REFLEX_COLORS     = ['red', 'yellow', 'green', 'purple', 'orange', 'pink'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// No debounce state needed — preset ID filtering handles all false-positive suppression.

// ── MQTT client ID → IP tracking ────────────────────────────────────────────
const mqttClientIpMap = {}; // { mqttClientId: remoteIp }

// ─────────────────────────────────────────────
//  SOCKET.IO  (WebSocket → React UI)
// ─────────────────────────────────────────────
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

httpServer.listen(WS_PORT, () => {
  console.info(`🚀  WLED Buzzer running  →  http://localhost:${WS_PORT}`);
  if (process.pkg) exec(`start http://localhost:${WS_PORT}`);
});

io.on('connection', (socket) => {
  socket.emit('gameState', { locked: gameLocked });
  socket.emit('scoreUpdate', { scores });
  socket.emit('autoWrongMs', { ms: autoWrongMs });
  socket.emit('currentPoints', { points: currentPoints });
  socket.emit('gameMode',    { mode: gameMode });
  socket.emit('reflexState', { state: reflexState });
  socket.emit('mqttClientIpMap', mqttClientIpMap);
  socket.emit('buzzerRoster', buzzerRoster);

  socket.on('manualReset', () => {
    clearTimeout(resetTimer);
    resetGame();
  });

  socket.on('setAutoWrong', ({ ms }) => {
    const clamped = Math.max(1000, Math.min(60000, Number(ms)));
    autoWrongMs = clamped;
    io.emit('autoWrongMs', { ms: autoWrongMs });
  });

  socket.on('setPoints', ({ points }) => {
    currentPoints = Math.max(0, Number(points));
  });

  socket.on('setGameMode', ({ mode }) => {
    gameMode = mode;
    io.emit('gameMode', { mode });
  });

  socket.on('startReflex', () => {
    if (reflexState !== 'idle') return;
    runReflexRound();
  });

  socket.on('abortReflex', () => {
    abortReflexRound();
  });

  // ── Master WLED controls ──────────────────────────────────────────────────
  socket.on('wledPushMqtt', async ({ ip }) => {
    // Derive the server's own IP to use as the MQTT broker address
    const brokerIp = (() => {
      for (const addrs of Object.values(os.networkInterfaces())) {
        for (const a of addrs) {
          if (a.family === 'IPv4' && !a.internal) return a.address;
        }
      }
      return '127.0.0.1';
    })();
    const lastOctet = ip.split('.').pop();
    const clientId  = `Buzzer-${lastOctet}`;

    console.info(`⚙️  Pushing MQTT config to ${ip}…`);
    socket.emit('wledMqttProgress', { ip, msg: `Pushing config… (broker=${brokerIp}, id=${clientId})` });

    try {
      await axios.post(`http://${ip}/json/cfg`, {
        if: {
          mqtt: {
            en:       true,
            broker:   brokerIp,
            port:     MQTT_PORT,
            clientid: clientId,
            user:     '',
            psk:      '',
          },
        },
      }, { timeout: SETUP_TIMEOUT_MS });

      socket.emit('wledMqttProgress', { ip, msg: 'Config saved — rebooting…' });
      console.info(`✅  MQTT config saved on ${ip}, rebooting…`);

      // Trigger reboot
      await axios.post(`http://${ip}/json/state`, { rb: true }, { timeout: WLED_TIMEOUT_MS }).catch(() => {});

      socket.emit('wledMqttDone', { ip, clientId, brokerIp });
    } catch (e) {
      console.info(`⚠️  MQTT config failed for ${ip}: ${e.message}`);
      socket.emit('wledMqttError', { ip, msg: e.message });
    }
  });

  socket.on('setBuzzerRoster', async (roster) => {
    // roster = [{ hexId, ip, name }] — only the active buzzers the host selected
    buzzerRoster = roster;
    console.info(`📋  Roster: ${roster.map(r => r.name || r.hexId).join(', ')}`);
    io.emit('buzzerRoster', buzzerRoster);
    io.emit('rosterPresetsReady', false);
    // Push game presets to each buzzer so ps=1 always means a real button press
    for (const { hexId, ip, name } of buzzerRoster) {
      const liveIp = mqttClientIpMap[hexId] ?? ip;
      if (liveIp && liveIp !== 'unknown') {
        await setupPresets(name || hexId, liveIp);
      } else {
        console.info(`⚠️  No IP for ${hexId} — skipping`);
      }
    }
    io.emit('rosterPresetsReady', true);
  });

  socket.on('wledSetupPresets', async ({ ip, name }) => {
    const label = name || ip;
    let step = 0;
    const total = PRESET_DEFS.length;
    socket.emit('wledPresetProgress', { ip, step, total, msg: `Starting…` });
    try {
      for (const p of PRESET_DEFS) {
        try {
          await axios.post(
            `http://${ip}/json/state`,
            { ...p.state, psave: p.id, n: p.n },
            { timeout: SETUP_TIMEOUT_MS }
          );
          step++;
          socket.emit('wledPresetProgress', { ip, step, total, msg: `Saved preset ${p.id} "${p.n}"` });
        } catch (e) {
          socket.emit('wledPresetProgress', { ip, step, total, msg: `⚠️ Preset ${p.id} failed: ${e.message}` });
        }
        await sleep(PRESET_SAVE_DELAY_MS);
      }
      await axios.post(`http://${ip}/json/state`, { ps: PRESET.IDLE }, { timeout: WLED_TIMEOUT_MS }).catch(() => {});
      socket.emit('wledPresetDone', { ip });
    } catch (e) {
      socket.emit('wledPresetError', { ip, msg: e.message });
    }
  });

  // ── WLED auto-discovery ──────────────────────────────────────────────────
  socket.on('discoverWleds', () => {
    // Derive the /24 subnet from the first non-loopback IPv4 interface
    const subnet = (() => {
      for (const addrs of Object.values(os.networkInterfaces())) {
        for (const a of addrs) {
          if (a.family === 'IPv4' && !a.internal) {
            return a.address.split('.').slice(0, 3).join('.');
          }
        }
      }
      return '192.168.1'; // fallback
    })();

    const total = 254;
    let done = 0;
    console.info(`🔍  Scanning ${subnet}.1–254 for WLED devices…`);

    const probes = Array.from({ length: total }, (_, i) => {
      const ip = `${subnet}.${i + 1}`;
      return axios.get(`http://${ip}/json/info`, { timeout: 400 })
        .then((res) => {
          const info = res.data;
          console.info(`💡  WLED found: ${ip}  (${info.name ?? '?'})`); 
          socket.emit('wledFound', { ip, ...info });
        })
        .catch(() => { /* not a WLED, or offline */ })
        .finally(() => {
          done++;
          // Emit progress every 10 hosts to avoid flooding
          if (done % 10 === 0 || done === total) {
            socket.emit('wledScanProgress', { done, total });
          }
        });
    });

    Promise.all(probes).then(() => {
      console.info('✅  Scan complete.');
      socket.emit('wledScanDone');
    });
  });

  socket.on('wledIdle', () => {
    wledAll(PRESET.IDLE).catch(() => {});
  });

  socket.on('wledPress', () => {
    wledAll(PRESET.PRESS).catch(() => {});
  });

  socket.on('wledBrightness', ({ bri }) => {
    const reqs = buzzerRoster.map(({ hexId, ip: storedIp, name }) => {
      const ip = mqttClientIpMap[hexId] ?? storedIp;
      if (!ip || ip === 'unknown') return null;
      return axios.post(`http://${ip}/json/state`, { bri }, { timeout: WLED_TIMEOUT_MS })
        .catch(() => {});
    }).filter(Boolean);
    Promise.all(reqs).catch(() => {});
  });

  socket.on('resetScores', () => {
    Object.keys(scores).forEach((k) => delete scores[k]);
    io.emit('scoreUpdate', { scores });
  });

  // Dev helper: simulate a buzz from the UI without needing physical hardware
  socket.on('testBuzz', ({ deviceId }) => {
    if (gameLocked) return;
    const id = deviceId || 'test-device';
    handleWinner(id);
  });

  // Game master verdict: { winnerId, verdict: 'correct'|'wrong', points: number }
  socket.on('judgeCall', async ({ winnerId, verdict, points }) => {
    if (!gameLocked) return; // stray click after reset, ignore
    if (resetTimer && resetTimer._idleTimeout === 1500) return; 
    clearTimeout(resetTimer);

    const delta = verdict === 'correct' ? +points : -points;
    if (!(winnerId in scores)) scores[winnerId] = 0;
    scores[winnerId] += delta;

    const icon = verdict === 'correct' ? '✅' : '❌';
    console.info(`${icon}  ${winnerId}  ${delta > 0 ? '+' : ''}${delta} pts  (total: ${scores[winnerId]})`); 

    // Broadcast updated scores to all UIs
    io.emit('scoreUpdate', { scores });
    io.emit('verdict', { verdict });

    // Start reset immediately — don't wait for WLED
    resetTimer = setTimeout(resetGame, RESET_DELAY_MS);

    // Fire WLED non-blocking. Pass null so ALL devices get the same verdict color
    // (Phase 2: swap null for winnerId once BUZZERS keys match WLED client IDs)
    const presetId = verdict === 'correct' ? PRESET.WINNER : PRESET.LOSER;
    wledAll(presetId).catch(() => {});
  });
});

// ─────────────────────────────────────────────
//  AEDES MQTT BROKER
// ─────────────────────────────────────────────
const tcpServer = net.createServer(aedes.handle);

// Log every connected WLED device
aedes.on('client', (client) => {
  const ip = client.conn?.remoteAddress?.replace(/^::ffff:/, '') ?? 'unknown';
  console.info(`📡  Buzzer connected: ${client.id} (${ip})`);
});
aedes.on('clientDisconnect', (client) => {
  console.info(`📴  Buzzer disconnected: ${client.id}`);
});

// Capture topic-based hex ID → IP mapping (topic prefix ≠ MQTT Client ID in WLED)
aedes.on('publish', (packet, client) => {
  if (!client) return; // broker-internal / retained messages
  const parts = packet.topic.split('/');
  if (parts[0] !== 'wled' || parts.length < 2) return;
  const hexId = parts[1];
  const ip = client.conn?.remoteAddress?.replace(/^::ffff:/, '') ?? 'unknown';
  if (mqttClientIpMap[hexId] !== ip) {
    mqttClientIpMap[hexId] = ip;
    io.emit('mqttClientIpMap', { ...mqttClientIpMap });
  }
});

tcpServer.listen(MQTT_PORT, () => {
  startGameLogic();
});

// ─────────────────────────────────────────────
//  GAME LOGIC  (subscribes to the broker above)
// ─────────────────────────────────────────────
function startGameLogic() {
  const client = mqtt.connect(`mqtt://localhost:${MQTT_PORT}`);

    client.on('connect', async () => {
    console.info('✅  Game ready — waiting for buzzers.');

    // Presets are pushed when the host confirms the buzzer roster from the UI.
    // No hardcoded devices — we wait silently until setBuzzerRoster is received.

    /**
     * WLED publishes button presses on:
     *   wled/<clientId>/status
     * Payload examples from WLED firmware:
     *   {"state":{"ps":1}}  — after button triggers preset 1
     *
     * We also listen for wled/+/g (generic) and wled/+/v (version)
     * The CONFIRMED reliable topic for a button macro is:
     *   wled/<clientId>/status  with payload containing "ps":<presetId>
     *
     * Tip: Use MQTT Explorer to sniff exact payloads during Phase 1 testing
     * and adjust the parseWinner() function below if needed.
     */
    client.subscribe('wled/+/status');
    client.subscribe('wled/+/g');
    client.subscribe('wled/#');
  });

  client.on('message', (topic, message) => {
    const deviceId = parseWinner(topic, message);
    if (!deviceId) return;

    // Setup phase: no roster yet — buzz identifies the device in the UI, no game started
    if (buzzerRoster.length === 0) {
      io.emit('setupBuzz', { id: deviceId });
      return;
    }

    if (gameMode === 'reflex') {
      handleReflexBuzz(deviceId);
      return;
    }

    if (gameLocked) {
      console.log(`[GAME]   Locked — ignored.`);
      return;
    }

    handleWinner(deviceId);
  });

  client.on('error', (err) => {
    console.info(`⚠️  MQTT error: ${err.message}`);
  });
}

/**
 * Extract the buzzer/client ID from an incoming MQTT message.
 * Returns null if this message should not trigger a winner event.
 *
 * WLED topic structure: wled/<clientId>/status
 * WLED sends a JSON payload when a macro fires, e.g.:
 *   {"state":{"ps":1,"on":true,"bri":255}}
 *
 * Adjust the logic here based on what you observe in Phase 1.
 */
function parseWinner(topic, message) {
  const parts = topic.split('/');

  // Only handle wled/<clientId> and wled/<clientId>/<subtopic>
  if (parts[0] !== 'wled' || parts.length < 2 || parts.length > 3) return null;

  const clientId = parts[1];
  const subtopic = parts[2] ?? '(base)'; // e.g. "g", "status", or "(base)"
  const raw = message.toString().trim();



  // ── 1. Lifecycle messages — log only, no debounce state needed ────────────
  if (raw === 'offline' || raw === 'online') return null;

  // ── 2. JSON state message — the gold standard ──────────────────────────
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

  // ── 3. /v (XML state dump) — THE buzz trigger ────────────────────────────
  // We control ps values: our API always recalls ps=2 (winner), ps=3 (loser),
  // ps=4 (idle). So WLED will always reconnect reporting one of those values.
  // ps=1 (PRESS preset) can ONLY appear when the physical button is pressed.
  if (subtopic === 'v') {
    const psMatch = raw.match(/<ps>(\d+)<\/ps>/);
    if (!psMatch) return null;
    const presetId = parseInt(psMatch[1], 10);
    if (presetId !== PRESET.PRESS) return null;
    return clientId;
  }

  // ── 4. /g /c — ignored ────────────────────────────────────────────────
  if (subtopic === 'g' || subtopic === 'c') {
    return null;
  }

  return null;
}

// ─────────────────────────────────────────────
//  WINNER HANDLER
// ─────────────────────────────────────────────
async function handleWinner(winnerId) {
  gameLocked = true;
  console.info(`🏆  Buzz: ${winnerId} — waiting for verdict…`);

  // Notify React UI immediately
  io.emit('winner', { id: winnerId });

  // The WLED already flashed its own button-press macro (Preset 1).
  // We do NOT fire colors here — that happens on judgeCall.

  // Auto-wrong fallback if game master doesn't respond in time
  resetTimer = setTimeout(() => {
    console.info(`⏱️  Auto-wrong: ${winnerId}  -${currentPoints} pts`);
    if (!(winnerId in scores)) scores[winnerId] = 0;
    scores[winnerId] -= currentPoints;
    io.emit('scoreUpdate', { scores });
    io.emit('verdict', { verdict: 'wrong', auto: true });
    wledAll(PRESET.LOSER).then(() => {
      setTimeout(resetGame, RESET_DELAY_MS);
    });
  }, autoWrongMs);


}

// ─────────────────────────────────────────────
//  WLED JSON API HELPERS
// ─────────────────────────────────────────────

/**
 * Recall a WLED preset by ID on all devices.
 * Using preset recall (ps) instead of raw RGB means WLED remembers the preset
 * ID, so any reconnect burst will report that same ID — never ps=1 (PRESS).
 */
async function wledAll(presetId) {
  if (buzzerRoster.length === 0) return; // no roster yet — silent no-op
  const requests = buzzerRoster.map(({ hexId, ip: storedIp }) => {
    const ip = mqttClientIpMap[hexId] ?? storedIp;
    if (!ip || ip === 'unknown') return null;
    return axios.post(`http://${ip}/json/state`,
      { ps: presetId },
      { timeout: WLED_TIMEOUT_MS }
    ).catch(() => {});
  }).filter(Boolean);
  await Promise.all(requests);
}

/**
 * Push all 4 preset definitions to a WLED device.
 * Called once on server start for each buzzer.
 */
async function setupPresets(buzzerId, ip) {
  console.info(`⚙️  Setting up ${buzzerId}…`);
  for (const p of PRESET_DEFS) {
    try {
      await axios.post(
        `http://${ip}/json/state`,
        { ...p.state, psave: p.id, n: p.n },
        { timeout: SETUP_TIMEOUT_MS }
      );
    } catch (e) {
      console.info(`⚠️  ${buzzerId} preset ${p.id} failed: ${e.message}`);
    }
    // Give WLED time to write the preset to flash before the next save
    await sleep(PRESET_SAVE_DELAY_MS);
  }
  // Leave device in idle state
  await axios.post(`http://${ip}/json/state`, { ps: PRESET.IDLE }, { timeout: WLED_TIMEOUT_MS }).catch(() => {});
  console.info(`✅  ${buzzerId} ready.`);
}

// ─────────────────────────────────────────────
//  RESET
// ─────────────────────────────────────────────
async function resetGame() {
  io.emit('reset');
  io.emit('scoreUpdate', { scores }); // always re-sync scores on reset

  // Return all WLEDs to idle preset
  await wledAll(PRESET.IDLE).catch(() => {});

  gameLocked = false;
  io.emit('gameState', { locked: false });
}

// ─────────────────────────────────────────────
//  REFLEX MODE
// ─────────────────────────────────────────────
async function runReflexRound() {
  reflexState       = 'countdown';
  reflexBuzzes      = [];
  reflexFalseStarts = [];
  reflexGoTime      = null;
  io.emit('reflexState', { state: 'countdown' });

  for (let i = 3; i >= 1; i--) {
    io.emit('reflexCountdown', { count: i });
    await sleep(REFLEX_COUNTDOWN_STEP_MS);
  }

  reflexState = 'sequence';
  io.emit('reflexState', { state: 'sequence' });

  const numFlashes = Math.floor(Math.random() * 8) + 4; // 4–11 distractors
  for (let i = 0; i < numFlashes; i++) {
    const color = REFLEX_COLORS[Math.floor(Math.random() * REFLEX_COLORS.length)];
    io.emit('reflexFlash', { color });
    await sleep(Math.floor(Math.random() * REFLEX_FLASH_RANGE_MS) + REFLEX_FLASH_MIN_MS);
  }

  // GO!
  reflexState  = 'go';
  reflexGoTime = Date.now();
  io.emit('reflexState', { state: 'go' });
  io.emit('reflexFlash', { color: 'blue', go: true });

  reflexSeqTimer = setTimeout(closeReflexRound, REFLEX_COLLECT_MS);
}

function handleReflexBuzz(deviceId) {
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
  io.emit('reflexState', { state: 'closed' });

  const multipliers = [3, 2, 1, 0];
  const awards = reflexBuzzes.map((b, i) => {
    const mult = multipliers[i] ?? 0;
    const pts  = mult * currentPoints;
    if (!(b.id in scores)) scores[b.id] = 0;
    scores[b.id] += pts;
    return { id: b.id, ms: b.ms, position: i + 1, multiplier: mult, pts };
  });

  reflexFalseStarts.forEach(id => {
    if (!(id in scores)) scores[id] = 0;
    scores[id] -= currentPoints;
  });

  io.emit('reflexResult', { awards, falseStarts: reflexFalseStarts });
  io.emit('scoreUpdate', { scores });
  console.info(`🏁  Reflex round: ${awards.length} finishers, ${reflexFalseStarts.length} false starts.`);

  setTimeout(() => {
    reflexState = 'idle';
    io.emit('reflexState', { state: 'idle' });
    io.emit('reflexReset');
    wledAll(PRESET.IDLE).catch(() => {});
  }, REFLEX_RESULTS_MS);
}

function abortReflexRound() {
  clearTimeout(reflexSeqTimer);
  reflexState       = 'idle';
  reflexBuzzes      = [];
  reflexFalseStarts = [];
  reflexGoTime      = null;
  console.info('🔄  Reflex round aborted.');
  io.emit('reflexAborted');
  io.emit('reflexState', { state: 'idle' });
}
