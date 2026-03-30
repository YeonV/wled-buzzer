// Plugin auto-discovery for game modes.
// Scans plugins/*/manifest.json and loads all associated files.
// Plugins that don't exist are simply not loaded — no broken imports.

// Auto-discover all plugin files via Vite's import.meta.glob
const manifests = import.meta.glob('../../../plugins/**/manifest.json', { eager: true, import: 'default' });
const screenLoaders = import.meta.glob('../../../plugins/**/Screen.jsx',    { eager: false });
const stores    = import.meta.glob('../../../plugins/**/store.js',      { eager: true });
const bridges   = import.meta.glob('../../../plugins/**/bridge.js',     { eager: true });
const styles    = import.meta.glob('../../../plugins/**/styles.css',    { eager: true });
const localeFiles = import.meta.glob('../../../plugins/**/locales.json', { eager: true, import: 'default' });

// Build registry keyed by plugin name
const pluginRegistry = {};

for (const [path, manifest] of Object.entries(manifests)) {
  const dir = path.replace('/manifest.json', '');
  const name = manifest.name;

  pluginRegistry[name] = {
    manifest,
    screenLoader: screenLoaders[`${dir}/Screen.jsx`] ?? null,
    Screen:  null,
    store:   stores[`${dir}/store.js`]       ?? null,
    bridge:  bridges[`${dir}/bridge.js`]     ?? null,
    locales: localeFiles[`${dir}/locales.json`] ?? null,
  };
}

import { lazy } from 'react';

/**
 * Get all plugin screen components: { modeName: LazyScreenComponent }
 */
const _pluginScreens = {};
export function getPluginScreens() {
  for (const [name, plugin] of Object.entries(pluginRegistry)) {
    if (plugin.screenLoader && !_pluginScreens[name]) {
      _pluginScreens[name] = lazy(() => plugin.screenLoader().then(m => ({ default: m.default })));
    }
  }
  return _pluginScreens;
}

/**
 * Get merged default state from all plugins
 */
export function getPluginDefaultState() {
  let state = {};
  for (const plugin of Object.values(pluginRegistry)) {
    if (plugin.store?.defaultState) Object.assign(state, plugin.store.defaultState);
  }
  return state;
}

/**
 * Get a factory that returns merged handler functions from all plugins.
 * Called with (set, get) from zustand's create callback.
 */
export function getPluginHandlers() {
  return (set, get) => {
    let handlers = {};
    for (const plugin of Object.values(pluginRegistry)) {
      if (plugin.store?.handlers) Object.assign(handlers, plugin.store.handlers(set, get));
    }
    return handlers;
  };
}

/**
 * Register all plugin socket bridge listeners
 */
export function registerPluginBridges(socket, gameGetter) {
  for (const plugin of Object.values(pluginRegistry)) {
    if (plugin.bridge?.register) plugin.bridge.register(socket, gameGetter);
  }
}

/**
 * Get mode labels from all plugins: { modeName: 'Display Name' }
 */
export function getPluginModeLabels() {
  const labels = {};
  for (const [name, plugin] of Object.entries(pluginRegistry)) {
    labels[name] = plugin.manifest.displayName ?? name;
  }
  return labels;
}

/**
 * Get merged locale strings for a language: { key: 'translation' }
 */
export function getPluginLocales(lang) {
  let merged = {};
  for (const plugin of Object.values(pluginRegistry)) {
    if (plugin.locales?.[lang]) Object.assign(merged, plugin.locales[lang]);
  }
  return merged;
}

/**
 * Get all plugin manifests
 */
export function getPluginManifests() {
  return Object.values(pluginRegistry).map(p => p.manifest);
}

export default pluginRegistry;
