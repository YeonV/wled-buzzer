'use strict';
const axios = require('axios');
const os    = require('os');
const { LEDFX_URL: _LEDFX_URL_CFG, LEDFX_ALL_IDS } = require('../constants');

const LEDFX_TIMEOUT = 1500;

// Mutable — may be updated by probe() if localhost is refused
let LEDFX_URL = _LEDFX_URL_CFG;

let _getBuzzerRoster = () => [];

function init({ getBuzzerRoster }) {
  _getBuzzerRoster = getBuzzerRoster;
}

// Fallback: derive virtual id from display name (e.g. 'Herz' → 'herz')
function ledfxId(displayName) { return (displayName || '').toLowerCase().trim(); }

// Resolve virtual IDs for a roster entry — mapped goveeIds take priority, fallback to name→lowercase
function ledfxIds(hexId) {
  const r = _getBuzzerRoster().find(e => e.hexId === hexId);
  if (r?.goveeIds?.length) return r.goveeIds;
  return r?.name ? [ledfxId(r.name)] : [];
}

// Core: always explicit virtuals, never omit (no accidental "target all")
async function ledfxApply(virtualIds, type, config = {}) {
  if (!virtualIds || !virtualIds.length) return;
  const body = { action: 'apply_global_effect', type, virtuals: virtualIds };
  if (Object.keys(config).length) body.config = config;
  await axios.put(`${LEDFX_URL}/api/effects`, body, { timeout: LEDFX_TIMEOUT }).catch(() => {});
}

// — LedFX preset helpers —
const ledfx     = (hexId, preset) => ledfxApply(ledfxIds(hexId), preset.type, preset.config ?? {});
const ledfxAll  = (preset) => {
  const ids = [...new Set(_getBuzzerRoster().flatMap(r => ledfxIds(r.hexId)).filter(Boolean))];
  ledfxApply(ids.length ? ids : LEDFX_ALL_IDS, preset.type, preset.config ?? {});
};
const ledfxMany = (hexIds, preset) => {
  const ids = [...new Set(hexIds.flatMap(ledfxIds).filter(Boolean))];
  if (ids.length) ledfxApply(ids, preset.type, preset.config ?? {});
};

/** Startup probe — informational only, never blocks. */
async function probe() {
  const port = new URL(LEDFX_URL).port || '8888';

  const tryUrl = async (url) => {
    const r = await axios.get(`${url}/api/virtuals`, { timeout: 3000 });
    const names = Object.values(r.data?.virtuals ?? {}).map(v => v.config?.name).join(', ');
    return names;
  };

  // First try configured URL (usually localhost)
  try {
    const names = await tryUrl(LEDFX_URL);
    console.info(`💡  LedFX online at ${LEDFX_URL} — virtuals: ${names || '(none)'}`);
    return;
  } catch (err) {
    if (err.code !== 'ECONNREFUSED') {
      console.info(`ℹ️   LedFX not reachable (${err.code ?? err.message}) — Govee addon inactive`);
      return;
    }
  }

  // localhost was refused — try the machine's own LAN IP (LedFX may bind to LAN only)
  const lanIp = (() => {
    for (const addrs of Object.values(os.networkInterfaces())) {
      for (const a of addrs) {
        if (a.family === 'IPv4' && !a.internal) return a.address;
      }
    }
    return null;
  })();

  if (!lanIp) {
    console.info('ℹ️   LedFX not reachable (ECONNREFUSED on localhost, no LAN IP) — Govee addon inactive');
    return;
  }

  const lanUrl = `http://${lanIp}:${port}`;
  try {
    const names = await tryUrl(lanUrl);
    LEDFX_URL = lanUrl; // update for all subsequent calls
    console.info(`💡  LedFX online at ${lanUrl} (LAN fallback) — virtuals: ${names || '(none)'}`);
  } catch (err2) {
    console.info(`ℹ️   LedFX not reachable on localhost or ${lanUrl} (${err2.code ?? err2.message}) — Govee addon inactive`);
  }
}

module.exports = { init, ledfxId, ledfxIds, ledfxApply, ledfx, ledfxAll, ledfxMany, probe };
