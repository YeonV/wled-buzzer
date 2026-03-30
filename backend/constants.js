'use strict';
const fs   = require('fs');
const path = require('path');

// When running as a pkg .exe, prefer config.json next to the executable so
// users can edit ports / ledfxUrl without rebuilding.
const _cfgPath = process.env.BUZZER_CONFIG || (process.pkg
  ? path.join(path.dirname(process.execPath), 'config.json')
  : path.join(__dirname, 'config.json'));
const cfg = fs.existsSync(_cfgPath)
  ? JSON.parse(fs.readFileSync(_cfgPath, 'utf8'))
  : require('./config.json');

// ── Ports ────────────────────────────────────────────────────────────────────
const MQTT_PORT  = cfg.ports.mqtt;
const WS_PORT    = cfg.ports.ws;
const WLED_PORT  = cfg.wledPort ?? 80;
const LEDFX_URL  = process.env.LEDFX_URL || cfg.ledfxUrl;

// ── Timings ──────────────────────────────────────────────────────────────────
const REFLEX_COLLECT_MS        = cfg.timings.reflexCollectMs;
const REFLEX_RESULTS_MS        = cfg.timings.reflexResultsMs;
const REFLEX_COUNTDOWN_STEP_MS = cfg.timings.reflexCountdownStepMs;
const REFLEX_FLASH_MIN_MS      = cfg.timings.reflexFlashMinMs;
const REFLEX_FLASH_RANGE_MS    = cfg.timings.reflexFlashRangeMs;
const PRESET_SAVE_DELAY_MS     = cfg.timings.presetSaveDelayMs;
const WLED_TIMEOUT_MS          = cfg.timings.wledTimeoutMs;
const SETUP_TIMEOUT_MS         = cfg.timings.setupTimeoutMs;
const ELIMINATION_WINDOW_MS    = cfg.timings.eliminationWindowMs;
const AUTO_WRONG_MS_DEFAULT    = cfg.timings.autoWrongMsDefault;

// ── WLED preset ID map ───────────────────────────────────────────────────────
const PRESET = Object.fromEntries(
  Object.entries(cfg.wledPresets).map(([key, p]) => [key, p.id])
);
// { PRESS: 1, WINNER: 2, LOSER: 3, IDLE: 4 }

// WLED preset definitions sent to each device during setup
const PRESET_DEFS = Object.values(cfg.wledPresets).map(p => ({
  id: p.id,
  n:  p.n,
  state: {
    on:  true,
    bri: p.bri,
    seg: [{ fx: p.fx, sx: p.sx, col: [p.col] }],
  },
}));

// ── LedFX preset map ─────────────────────────────────────────────────────────
const LEDFX_PRESET = cfg.ledfxPresets;
// { PRESS: {type, ...}, IDLE: {type, config}, ... }

// ── LedFX fallback virtual IDs (used when roster has no goveeIds) ────────────
const LEDFX_ALL_IDS = cfg.ledfxFallbackIds;

module.exports = {
  MQTT_PORT,
  WS_PORT,
  WLED_PORT,
  LEDFX_URL,
  REFLEX_COLLECT_MS,
  REFLEX_RESULTS_MS,
  REFLEX_COUNTDOWN_STEP_MS,
  REFLEX_FLASH_MIN_MS,
  REFLEX_FLASH_RANGE_MS,
  PRESET_SAVE_DELAY_MS,
  WLED_TIMEOUT_MS,
  SETUP_TIMEOUT_MS,
  ELIMINATION_WINDOW_MS,
  AUTO_WRONG_MS_DEFAULT,
  PRESET,
  PRESET_DEFS,
  LEDFX_PRESET,
  LEDFX_ALL_IDS,
};
