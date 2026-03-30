'use strict';
const axios = require('axios');
const os = require('os');
const {
  WLED_TIMEOUT_MS, SETUP_TIMEOUT_MS, PRESET_SAVE_DELAY_MS,
  PRESET_DEFS, PRESET, MQTT_PORT, WLED_PORT,
} = require('../constants');
const { sleep } = require('./utils');

/** Build a WLED base URL, using WLED_PORT (default 80 in production, test port in tests). */
const wUrl = (ip, path) => `http://${ip}:${WLED_PORT}${path}`;

let _getBuzzerRoster = () => [];
let _getMqttMap      = () => ({});

function init({ getBuzzerRoster, getMqttMap }) {
  _getBuzzerRoster = getBuzzerRoster;
  _getMqttMap      = getMqttMap;
}

/**
 * Recall a WLED preset by ID on all devices.
 * Using preset recall (ps) instead of raw RGB means WLED remembers the preset
 * ID, so any reconnect burst will report that same ID — never ps=1 (PRESS).
 */
async function wledAll(presetId) {
  const roster = _getBuzzerRoster();
  if (roster.length === 0) return; // no roster yet — silent no-op
  const mqttMap = _getMqttMap();
  const requests = roster.map(({ hexId, ip: storedIp }) => {
    const ip = mqttMap[hexId] ?? storedIp;
    if (!ip || ip === 'unknown') return null;
    return axios.post(wUrl(ip, '/json/state'),
      { ps: presetId },
      { timeout: WLED_TIMEOUT_MS }
    ).catch(() => {});
  }).filter(Boolean);
  await Promise.all(requests);
}

async function wledOne(hexId, presetId) {
  const entry = _getBuzzerRoster().find(r => r.hexId === hexId);
  const ip = _getMqttMap()[hexId] ?? entry?.ip;
  if (!ip || ip === 'unknown') return;
  await axios.post(wUrl(ip, '/json/state'), { ps: presetId }, { timeout: WLED_TIMEOUT_MS }).catch(() => {});
}

async function wledDimOne(hexId) {
  const entry = _getBuzzerRoster().find(r => r.hexId === hexId);
  const ip = _getMqttMap()[hexId] ?? entry?.ip;
  if (!ip || ip === 'unknown') return;
  await axios.post(wUrl(ip, '/json/state'), { on: true, bri: 8 }, { timeout: WLED_TIMEOUT_MS }).catch(() => {});
}

/** Set raw brightness on all roster devices. */
async function wledBri(bri) {
  const roster = _getBuzzerRoster();
  const mqttMap = _getMqttMap();
  const reqs = roster.map(({ hexId, ip: storedIp }) => {
    const ip = mqttMap[hexId] ?? storedIp;
    if (!ip || ip === 'unknown') return null;
    return axios.post(wUrl(ip, '/json/state'), { bri }, { timeout: WLED_TIMEOUT_MS }).catch(() => {});
  }).filter(Boolean);
  await Promise.all(reqs);
}

/** Derive the server's own local IPv4 address for use as MQTT broker address. */
function getLocalIp() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return '127.0.0.1';
}

/**
 * Nudge a WLED device to publish its status via MQTT.
 * Sends a no-op state request that triggers an MQTT publish without changing anything.
 */
async function nudgeMqtt(ip) {
  await axios.post(wUrl(ip, '/json/state'), { v: true }, { timeout: WLED_TIMEOUT_MS }).catch(() => {});
}

/**
 * Wait for a device to come back online after reboot, then nudge it.
 */
async function waitAndNudge(ip, retries = 10, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    await sleep(delayMs);
    try {
      await axios.get(wUrl(ip, '/json/info'), { timeout: 2000 });
      console.info(`✅  ${ip} is back online, nudging MQTT…`);
      await nudgeMqtt(ip);
      return true;
    } catch { /* not up yet */ }
  }
  console.info(`⚠️  ${ip} did not come back after ${retries} retries`);
  return false;
}

/**
 * Push MQTT broker config to a WLED device and trigger a reboot.
 * Returns { clientId, brokerIp } on success, throws on failure.
 */
async function pushMqttConfig(ip) {
  const brokerIp = getLocalIp();
  const lastOctet = ip.split('.').pop();
  const clientId  = `Buzzer-${lastOctet}`;
  console.info(`⚙️  Pushing MQTT config to ${ip}…`);
  await axios.post(wUrl(ip, '/json/cfg'), {
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
  console.info(`✅  MQTT config saved on ${ip}, rebooting…`);
  await axios.post(wUrl(ip, '/json/state'), { rb: true }, { timeout: WLED_TIMEOUT_MS }).catch(() => {});
  return { clientId, brokerIp };
}

/**
 * Push all 4 preset definitions to a WLED device, reporting progress via onProgress(step, total, msg).
 * Called from the wledSetupPresets socket handler.
 */
async function setupPresetsWithProgress(ip, onProgress) {
  const total = PRESET_DEFS.length;
  let step = 0;
  onProgress(step, total, 'Starting…');
  for (const p of PRESET_DEFS) {
    try {
      await axios.post(
        wUrl(ip, '/json/state'),
        { ...p.state, psave: p.id, n: p.n },
        { timeout: SETUP_TIMEOUT_MS }
      );
      step++;
      onProgress(step, total, `Saved preset ${p.id} "${p.n}"`);
    } catch (e) {
      onProgress(step, total, `⚠️ Preset ${p.id} failed: ${e.message}`);
    }
    await sleep(PRESET_SAVE_DELAY_MS);
  }
  await axios.post(wUrl(ip, '/json/state'), { ps: PRESET.IDLE }, { timeout: WLED_TIMEOUT_MS }).catch(() => {});
}

/**
 * Scan the local /24 subnet for WLED devices.
 * onFound(ip, info) — called for each discovered device.
 * onProgress(done, total) — called every 10 hosts and at the end.
 */
async function discover(onFound, onProgress) {
  const subnet = (() => {
    for (const addrs of Object.values(os.networkInterfaces())) {
      for (const a of addrs) {
        if (a.family === 'IPv4' && !a.internal) {
          return a.address.split('.').slice(0, 3).join('.');
        }
      }
    }
    return '192.168.1';
  })();
  const total = 254;
  let done = 0;
  console.info(`🔍  Scanning ${subnet}.1–254 for WLED devices…`);
  const brokerIp = getLocalIp();
  const probes = Array.from({ length: total }, (_, i) => {
    const ip = `${subnet}.${i + 1}`;
    return axios.get(wUrl(ip, '/json/info'), { timeout: 2000 })
      .then(async (res) => {
        const info = res.data;
        // Also fetch MQTT config to check if device is configured correctly
        try {
          const cfgRes = await axios.get(wUrl(ip, '/json/cfg'), { timeout: 2000 });
          const mqtt = cfgRes.data?.if?.mqtt;
          if (mqtt) {
            info.mqtt = {
              enabled: !!mqtt.en,
              broker:  mqtt.broker ?? '',
              port:    mqtt.port ?? 0,
              clientId: mqtt.cid ?? '',
              correctBroker: mqtt.en && mqtt.broker === brokerIp && mqtt.port === MQTT_PORT,
            };
          }
        } catch { /* cfg fetch failed — not critical */ }
        console.info(`💡  WLED found: ${ip}  (${info.name ?? '?'})${info.mqtt?.correctBroker ? ' ✓mqtt' : ''}`);
        onFound(ip, info);
        // Nudge correctly-configured devices so they publish to MQTT immediately
        if (info.mqtt?.correctBroker) nudgeMqtt(ip).catch(() => {});
      })
      .catch(() => {})
      .finally(() => {
        done++;
        if (done % 10 === 0 || done === total) onProgress(done, total);
      });
  });
  await Promise.all(probes);
  console.info('✅  Scan complete.');
}

/**
 * Push all 4 preset definitions to a WLED device.
 * Called once per buzzer during roster setup.
 * @param {string} buzzerId — label for logging
 * @param {string} ip
 * @param {number[]|null} idleColor — optional [r,g,b] override for the IDLE preset
 */
async function setupPresets(buzzerId, ip, idleColor) {
  console.info(`⚙️  Setting up ${buzzerId}…`);
  for (const p of PRESET_DEFS) {
    let state = p.state;
    // Override PRESS preset with player colour (scan, fx=11) when provided
    if (p.id === PRESET.PRESS && idleColor) {
      state = { on: true, bri: 255, seg: [{ fx: 11, sx: 200, col: [idleColor] }] };
    }
    // Override IDLE preset with player colour (solid, fx=0) when provided
    if (p.id === PRESET.IDLE && idleColor) {
      state = { on: true, bri: p.state.bri, seg: [{ fx: 0, sx: 0, col: [idleColor] }] };
    }
    try {
      await axios.post(
        wUrl(ip, '/json/state'),
        { ...state, psave: p.id, n: p.n },
        { timeout: SETUP_TIMEOUT_MS }
      );
    } catch (e) {
      console.info(`⚠️  ${buzzerId} preset ${p.id} failed: ${e.message}`);
    }
    // Give WLED time to write the preset to flash before the next save
    await sleep(PRESET_SAVE_DELAY_MS);
  }
  // Leave device in idle state
  await axios.post(wUrl(ip, '/json/state'), { ps: PRESET.IDLE }, { timeout: WLED_TIMEOUT_MS }).catch(() => {});
  console.info(`✅  ${buzzerId} ready.`);
}

/**
 * Overwrite the IDLE preset (4) on a single device with a solid colour.
 * rgb is a [r, g, b] array.
 */
async function wledSetIdleColor(ip, rgb) {
  await axios.post(wUrl(ip, '/json/state'), {
    on:  true,
    bri: 128,
    seg: [{ fx: 0, sx: 0, col: [rgb] }],
    psave: PRESET.IDLE,
    n: 'Idle',
  }, { timeout: SETUP_TIMEOUT_MS });
  // Recall it so the device shows the new colour immediately
  await axios.post(wUrl(ip, '/json/state'), { ps: PRESET.IDLE }, { timeout: WLED_TIMEOUT_MS }).catch(() => {});
}

module.exports = { init, wledAll, wledOne, wledDimOne, wledBri, pushMqttConfig, nudgeMqtt, waitAndNudge, setupPresets, setupPresetsWithProgress, discover, wledSetIdleColor };
