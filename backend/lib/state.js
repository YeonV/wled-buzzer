/**
 * Shared mutable game state — single source of truth for all server modules.
 * Every module imports this same object and reads/writes its properties directly.
 */
const path = require('path');
const fs = require('fs');
const { AUTO_WRONG_MS_DEFAULT } = require('../constants');

const ACTIVE_PACKS_PATH = process.pkg
  ? path.join(path.dirname(process.execPath), 'active-packs.json')
  : path.join(__dirname, '..', 'active-packs.json');
const PACKS_DIR = path.join(
  process.pkg
    ? path.join(path.dirname(process.execPath), 'public', 'uploads')
    : path.join(__dirname, '..', '..', 'frontend', 'public', 'uploads'),
  'packs'
);
const CUSTOM_PACKS_DIR = process.pkg
  ? path.join(path.dirname(process.execPath), 'custom-packs')
  : path.join(__dirname, '..', '..', 'custom-packs');

// ── Avatar settings helpers ─────────────────────────────────────────────────
function avatarSettingsPath() {
  try {
    const active = JSON.parse(fs.readFileSync(ACTIVE_PACKS_PATH, 'utf8'));
    return path.join(PACKS_DIR, active.avatars || 'default', 'settings.json');
  } catch { return path.join(PACKS_DIR, 'default', 'settings.json'); }
}

function loadAvatarSettings() {
  const settings = { size: 28, variant: 'outlined' };
  try {
    const asp = avatarSettingsPath();
    if (fs.existsSync(asp)) {
      const parsed = JSON.parse(fs.readFileSync(asp, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        settings.size = Number(parsed.size) || settings.size;
        settings.variant = parsed.variant === 'filled' ? 'filled' : 'outlined';
        if (['plain', 'rounded', 'circle'].includes(parsed.imageStyle)) settings.imageStyle = parsed.imageStyle;
      }
    }
  } catch (e) {
    console.error('Failed to load avatar settings:', e?.message || e);
  }
  return settings;
}

// Default values for all resettable game state.
// reset() deep-clones these to restore a fresh game.
const DEFAULTS = {
  gameLocked:       false,
  buzzerOpen:       true,
  resetTimer:       null,
  scores:           {},
  displayNames:     {},
  bladeLockCounts:  {},
  buzzerRoster:     [],
  setupSnapshot:    {},
  hexIdToPlayer:    {},
  currentPoints:    100,
  questionIndex:    0,
  showAnswer:       false,
  showAnswersOnly:  false,
  showQuestion:     false,
  answerReveal:     { chosenIndex: null, correctIndex: null },
  hintIndex:        0,
  lockedOutIds:     [],
  // Team management
  teamAssignments:  {},       // { playerId: teamIndex }
  teamNames:        [],       // ['Team Alpha', 'Team Beta', ...]
  teamColors:       [],       // [[r,g,b], ...]
  teamMode:         false,    // true when team scoring is active
  gameMode:         'quiz',
  autoWrongMs:      AUTO_WRONG_MS_DEFAULT,
  roundHistory:     [],
  roundCounter:     0,
  auraState:        {},
  mqttClientIpMap:  {},
  mqttClientNameMap:{},
};

const state = {
  ...JSON.parse(JSON.stringify(DEFAULTS)),
  // Non-serializable / non-resettable state
  idlePushThrottle: new Map(),
  IDLE_PUSH_INTERVAL: 400,

  // ── Theme / UI (persisted, NOT reset on endGame) ────────────────────────
  currentTheme:               'crystal',
  currentScoreboardPos:       'bottom',
  currentScoreboardActiveOnly: false,
  currentScoreboardVariant:   'default',
  currentScoreboardTopN:      0,        // 0 = show all, >0 = top N only
  currentScoreboardShowGaps:  false,
  currentLang:                'en',
  currentAvatarSettings:      loadAvatarSettings(),

  // ── Helpers ───────────────────────────────────────────────────────────────
  avatarSettingsPath,
  ACTIVE_PACKS_PATH,
  PACKS_DIR,
  CUSTOM_PACKS_DIR,
};

/** Reset all game state to fresh defaults (preserves theme/UI settings). */
state.reset = function () {
  clearTimeout(state.resetTimer);
  const fresh = JSON.parse(JSON.stringify(DEFAULTS));
  for (const [k, v] of Object.entries(fresh)) {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      if (typeof state[k] === 'object' && state[k] !== null) {
        Object.keys(state[k]).forEach(key => delete state[k][key]);
        Object.assign(state[k], v);
      } else {
        state[k] = v;
      }
    } else {
      state[k] = v;
    }
  }
  state.idlePushThrottle.clear();
};

// ── Checkpoint persistence ────────────────────────────────────────────────
const CHECKPOINT_PATH = process.pkg
  ? path.join(path.dirname(process.execPath), 'game-state.json')
  : path.join(__dirname, '..', 'game-state.json');

// Keys to persist (only game-critical state, not transient timers/throttles)
const CHECKPOINT_KEYS = [
  'scores', 'displayNames', 'buzzerRoster', 'setupSnapshot', 'hexIdToPlayer',
  'currentPoints', 'questionIndex', 'gameMode', 'autoWrongMs',
  'roundHistory', 'roundCounter', 'auraState',
  'teamAssignments', 'teamNames', 'teamColors', 'teamMode',
  'currentTheme', 'currentScoreboardPos', 'currentScoreboardActiveOnly',
  'currentScoreboardVariant', 'currentLang',
];

let _saveQueued = false;

/** Save a checkpoint (debounced — coalesces rapid writes into one) */
state.saveCheckpoint = function () {
  if (_saveQueued) return;
  _saveQueued = true;
  process.nextTick(() => {
    _saveQueued = false;
    const snap = {};
    for (const k of CHECKPOINT_KEYS) snap[k] = state[k];
    try {
      fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(snap, null, 2), 'utf8');
    } catch (e) {
      console.error('Checkpoint save failed:', e?.message || e);
    }
  });
};

/** Load checkpoint on startup. Returns true if state was restored. */
state.loadCheckpoint = function () {
  try {
    if (!fs.existsSync(CHECKPOINT_PATH)) return false;
    const snap = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
    for (const k of CHECKPOINT_KEYS) {
      if (k in snap) {
        // For object/array state, preserve the original reference where possible
        if (typeof state[k] === 'object' && state[k] !== null && !Array.isArray(state[k]) && typeof snap[k] === 'object') {
          Object.keys(state[k]).forEach(key => delete state[k][key]);
          Object.assign(state[k], snap[k]);
        } else {
          state[k] = snap[k];
        }
      }
    }
    // Restore buzzerOpen=false and gameLocked=false on resume (safe defaults)
    state.gameLocked = false;
    state.buzzerOpen = false;
    console.info('📂  Game state restored from checkpoint');
    return true;
  } catch (e) {
    console.error('Checkpoint load failed:', e?.message || e);
    return false;
  }
};

/** Delete checkpoint (used when ending game intentionally) */
state.deleteCheckpoint = function () {
  try { fs.unlinkSync(CHECKPOINT_PATH); } catch {}
};

module.exports = state;
