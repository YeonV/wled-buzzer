'use strict';

const fs = require('fs');
const path = require('path');

const PLUGINS_DIR = path.join(__dirname, '..', '..', 'plugins');

const plugins = {};     // { modeName: { manifest, module } }

/**
 * Scan plugins/ directory and require each plugin's backend.js
 */
function loadAll() {
  if (!fs.existsSync(PLUGINS_DIR)) return;
  _scanDir(PLUGINS_DIR);
  console.log(`[PLUGINS] Loaded: ${Object.keys(plugins).join(', ') || '(none)'}`);
}

function _scanDir(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (!fs.statSync(full).isDirectory()) continue;
    const manifestPath = path.join(full, 'manifest.json');
    const backendPath = path.join(full, 'backend.js');
    if (fs.existsSync(manifestPath) && fs.existsSync(backendPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const mod = require(backendPath);
      plugins[manifest.name] = { manifest, module: mod };
    } else {
      _scanDir(full); // recurse into subdirectories (e.g. plugins/private/)
    }
  }
}

/**
 * Init all plugins with the shared game context
 */
function initAll(gameCtx) {
  for (const { module } of Object.values(plugins)) {
    if (typeof module.init === 'function') module.init(gameCtx);
  }
}

/**
 * Register socket event handlers for all plugins
 */
function registerSocketHandlers(socket) {
  for (const { manifest, module } of Object.values(plugins)) {
    const events = manifest.socketEvents?.incoming ?? [];
    for (const { event, method } of events) {
      if (typeof module[method] === 'function') {
        socket.on(event, (d = {}) => module[method](d));
      }
    }
  }
}

/**
 * Emit state for all plugins to a socket (used on new connection)
 */
function emitStateAll(socket) {
  for (const { module } of Object.values(plugins)) {
    if (typeof module.emitState === 'function') module.emitState(socket);
  }
}

/**
 * Route a buzz to the correct plugin's handleBuzz, if the mode matches.
 * Returns true if handled, false if not a plugin mode.
 */
function routeBuzz(gameMode, deviceId) {
  const plugin = plugins[gameMode];
  if (plugin && plugin.manifest.hasBuzzHandler && typeof plugin.module.handleBuzz === 'function') {
    plugin.module.handleBuzz(deviceId);
    return true;
  }
  return false;
}

/**
 * Get list of loaded plugin names
 */
function getLoadedPlugins() {
  return Object.keys(plugins);
}

module.exports = { loadAll, initAll, registerSocketHandlers, emitStateAll, routeBuzz, getLoadedPlugins };
