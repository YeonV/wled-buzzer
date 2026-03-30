'use strict';
const wled = require('./wled');
const lfx  = require('./ledfx');
const { PRESET, LEDFX_PRESET } = require('../constants');

// ─────────────────────────────────────────────
//  UNIFIED LIGHT HELPERS  (WLED + LedFX together)
//  lightsAll / lightsOne / lightsMany fire both systems in one call.
//  DIM special-case: WLED uses raw bri:8 (wledDimOne), no stored preset.
// ─────────────────────────────────────────────

const lightsAll  = async (key) => {
  if (PRESET[key]       !== undefined) await wled.wledAll(PRESET[key]).catch(() => {});
  if (LEDFX_PRESET[key] !== undefined) lfx.ledfxAll(LEDFX_PRESET[key]);
};

const lightsOne  = (hexId, key) => {
  if (key === 'DIM')                    wled.wledDimOne(hexId);
  else if (PRESET[key] !== undefined)   wled.wledOne(hexId, PRESET[key]).catch(() => {});
  if (LEDFX_PRESET[key] !== undefined)  lfx.ledfx(hexId, LEDFX_PRESET[key]);
};

const lightsMany = (hexIds, key) => {
  if (key === 'DIM') hexIds.forEach(id => wled.wledDimOne(id));
  else if (PRESET[key] !== undefined) hexIds.forEach(id => wled.wledOne(id, PRESET[key]).catch(() => {}));
  if (LEDFX_PRESET[key] !== undefined) lfx.ledfxMany(hexIds, LEDFX_PRESET[key]);
};

module.exports = { lightsAll, lightsOne, lightsMany };
