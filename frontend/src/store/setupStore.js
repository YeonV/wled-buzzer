/* eslint-disable no-unused-vars */
import { create } from 'zustand';
import socket from '../services/socket';
import { loadRoster, mergeDevice, upgradeIpKey, emitSnapshot } from '../utils/setupHelpers';

// module-scoped hub for handlers, timers and abort controllers (avoids globalThis)
const storeHub = { handlers: {}, timers: {}, abortControllers: {} };

// ── Session persistence for moderator reload ──────────────────────────────
const SS_SETUP = 'buzzer-setup-state';

function loadSetupState() {
  try { return JSON.parse(sessionStorage.getItem(SS_SETUP) ?? 'null'); } catch { return null; }
}

let _persistTimer = null;
function persistSetup(get) {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    try {
      const { devices, colorMap } = get();
      const devs = {};
      for (const [k, d] of Object.entries(devices)) {
        if (!d.hexId) continue;
        devs[k] = { hexId: d.hexId, ip: d.ip, name: d.name, active: d.active, aliases: d.aliases, icon: d.icon, wledName: d.wledName };
      }
      sessionStorage.setItem(SS_SETUP, JSON.stringify({ devices: devs, colorMap }));
    } catch { /* ignore */ }
  }, 300);
}

export const useSetupStore = create((set, get) => ({
  devices: {},
  setDevices: (v) => {
    set({ devices: typeof v === 'function' ? v(get().devices) : v });
    try { get().autoMatchLedfx(); } catch (e) { /* ignore */ }
  },

  addonSel: {},
  setAddonSel: (v) => set({ addonSel: typeof v === 'function' ? v(get().addonSel) : v }),

  mqttStatus: {},
  setMqttStatus: (v) => set({ mqttStatus: typeof v === 'function' ? v(get().mqttStatus) : v }),

  mqttLog: {},
  setMqttLog: (v) => set({ mqttLog: typeof v === 'function' ? v(get().mqttLog) : v }),

  clientNameMap: {},
  setClientNameMap: (v) => set({ clientNameMap: typeof v === 'function' ? v(get().clientNameMap) : v }),

  colorMap: {},
  setColorMap: (v) => set({ colorMap: typeof v === 'function' ? v(get().colorMap) : v }),

  ledfxDevices: null,
  setLedfxDevices: (v) => {
    set({ ledfxDevices: typeof v === 'function' ? v(get().ledfxDevices) : v });
    try { get().autoMatchLedfx(); } catch (e) { /* ignore */ }
  },

  // Fetch LedFX devices from backend and auto-select addons by name
  fetchLedfxDevices: async () => {
    try {
      const ac = new AbortController();
      storeHub.abortControllers = storeHub.abortControllers || {};
      storeHub.abortControllers.fetchLedfx = ac;
      const r = await fetch('/api/ledfx/devices', { signal: ac.signal });
      const d = await r.json();
      const devs = d.devices ?? [];
      set({ ledfxDevices: devs });
      if (devs.length > 0) {
        try { get().autoMatchLedfx(); } catch (e) { /* ignore */ }
      }
      // clear stored controller after success
      try { delete storeHub.abortControllers.fetchLedfx; } catch (e) { /* ignore */ }
    } catch (e) {
      // if aborted or failed, clear and set empty
      try { delete storeHub.abortControllers.fetchLedfx; } catch (err) { /* ignore */ }
      set({ ledfxDevices: [] });
    }
  },

  // Auto-match LedFX virtuals by name (can be called after devices or ledfxDevices change)
  autoMatchLedfx: () => {
    const devs = get().ledfxDevices;
    if (!Array.isArray(devs) || devs.length === 0) return;
    const devices = get().devices || {};
    const next = { ...(get().addonSel || {}) };
    let changed = false;
    for (const [key, dev] of Object.entries(devices)) {
      if (key.startsWith('ip:') || next[key]?.length) continue;
      const effectiveName = (dev.name || dev.wledName || '').toLowerCase();
      if (!effectiveName) continue;
      const match = devs.find(ld => ld.name.toLowerCase() === effectiveName);
      if (match) { next[key] = [match.id]; changed = true; }
    }
    if (changed) set({ addonSel: next });
  },

  // Clear persisted roster and in-memory devices
  clearRoster: () => {
    try { sessionStorage.removeItem('buzzer-roster'); } catch (e) { /* ignore */ }
    set({ devices: {} });
  },

  // Start socket listeners and helpers. Call on mount. Returns nothing.
  init: (initialDevices) => {
    // Restore saved setup state from sessionStorage (survives refresh)
    const saved = loadSetupState();
    if (saved) {
      const merged = { ...initialDevices };
      for (const [k, d] of Object.entries(saved.devices ?? {})) {
        merged[k] = { ...(merged[k] ?? {}), ...d, ip: merged[k]?.ip ?? d.ip };
      }
      set({ devices: merged, colorMap: saved.colorMap ?? {} });
    } else if (initialDevices) {
      set({ devices: initialDevices });
    }

    // Listen for backend snapshot (restores state after server restart)
    const onSnapshot = (snapshot) => {
      set(st => {
        const nextDevices = { ...st.devices };
        const nextColors = { ...st.colorMap };
        for (const [hexId, data] of Object.entries(snapshot)) {
          if (nextDevices[hexId]) {
            if (data.name) nextDevices[hexId] = { ...nextDevices[hexId], name: data.name };
            if (data.active !== undefined) nextDevices[hexId] = { ...nextDevices[hexId], active: data.active };
            if (data.icon !== undefined) nextDevices[hexId] = { ...nextDevices[hexId], icon: data.icon };
            if (data.aliases) nextDevices[hexId] = { ...nextDevices[hexId], aliases: data.aliases };
          }
          if (data.color !== undefined) nextColors[hexId] = { color: data.color, useIndividual: !!data.useIndividual };
        }
        return { devices: nextDevices, colorMap: nextColors };
      });
      persistSetup(get);
    };
    socket.on('setupSnapshot', onSnapshot);
    storeHub.onSnapshot = onSnapshot;

    // emit initial snapshot to connected displays/backend
    try { emitSnapshot(get().devices, socket, get().colorMap); } catch (e) { /* ignore */ }

    // fetch LedFX devices and perform addon preselection
    try { get().fetchLedfxDevices(); } catch (e) { /* ignore */ }

    const savedRoster = loadRoster();

    // use module-scoped holders for handlers/timers so stopListeners can clean up
    storeHub.timers = storeHub.timers || {};
    storeHub.abortControllers = storeHub.abortControllers || {};

    const onClientNameMap = (map) => set({ clientNameMap: map });

    const onMqttMap = (rawMap) => {
      const syncEmits = [];
      set(st => {
        let next = { ...st.devices };
        for (const [hexId, ip] of Object.entries(rawMap)) {
          next = upgradeIpKey(next, ip, hexId, savedRoster);
          if (!next[hexId]) {
            const saved = savedRoster.find(r => r.hexId === hexId);
            next[hexId] = {
              hexId,
              ip,
              name:     saved?.name   ?? '',
              active:   saved?.active ?? false,
              aliases:  saved?.aliases ?? [],
              wledName: '',
              fw:       '',
              mac:      '',
              buzzing:  false,
            };
          } else {
            next[hexId] = { ...next[hexId], ip };
          }
          syncEmits.push({ hexId, wledName: next[hexId].wledName ?? '', active: !!next[hexId].active });
        }
        // emit outside set
        setTimeout(() => {
          for (const { hexId, wledName, active } of syncEmits) {
            if (wledName) socket.emit('setupWledName',     { hexId, wledName });
            socket.emit('setupActiveToggle', { hexId, active });
          }
        }, 0);
        return { devices: next };
      });
    };

    const onFound = ({ ip, name: wledName, ver: fw, mac, mqtt }) => {
      const known = Object.entries(get().devices).find(([, d]) => d.ip === ip);
      if (known && known[1].hexId && wledName) {
        socket.emit('setupWledName', { hexId: known[1].hexId, wledName });
      }
      const mqttInfo = mqtt ?? null;
      set(prev => {
        const existing = Object.entries(prev.devices).find(([, d]) => d.ip === ip);
        if (existing) {
          const [key] = existing;
          return { devices: mergeDevice(prev.devices, key, { wledName: wledName ?? '', fw: fw ?? '', mac: mac ?? '', mqtt: mqttInfo }) };
        }
        const key = `ip:${ip}`;
        return { devices: mergeDevice(prev.devices, key, {
          hexId:    null,
          ip,
          name:     '',
          active:   false,
          wledName: wledName ?? '',
          fw:       fw       ?? '',
          mac:      mac      ?? '',
          mqtt:     mqttInfo,
          buzzing:  false,
        }) };
      });
    };

    const onSetupBuzz = ({ id: hexId }) => {
      const timers = storeHub.timers;
      set(st => {
        const entry = st.devices[hexId] ?? {
          hexId,
          ip:       '',
          name:     '',
          active:   false,
          aliases:  [],
          wledName: '',
          fw:       '',
          mac:      '',
          buzzing:  false,
        };
        const wasActive = entry.active;
        if (!wasActive) socket.emit('setupActiveToggle', { hexId, active: true });
        return { devices: { ...st.devices, [hexId]: { ...entry, active: true, buzzing: true } } };
      });
      clearTimeout(timers[hexId]);
      timers[hexId] = setTimeout(() => {
        set(st => ({ devices: st.devices[hexId] ? { ...st.devices, [hexId]: { ...st.devices[hexId], buzzing: false } } : st.devices }));
      }, 1500);
    };

    const onMqttProgress = ({ ip, msg }) => set(st => ({ mqttLog: { ...st.mqttLog, [ip]: msg } }));
    const onMqttDone = ({ ip, clientId, brokerIp }) => {
      set(st => ({ mqttStatus: { ...st.mqttStatus, [ip]: 'done' }, mqttLog: { ...st.mqttLog, [ip]: `✓ ${clientId} → ${brokerIp}` } }));
    };
    const onMqttError = ({ ip, msg }) => set(st => ({ mqttStatus: { ...st.mqttStatus, [ip]: 'error' }, mqttLog: { ...st.mqttLog, [ip]: `⚠ ${msg}` } }));

    // store handlers for cleanup
    storeHub.handlers = { onClientNameMap, onMqttMap, onFound, onSetupBuzz, onMqttProgress, onMqttDone, onMqttError };

    socket.on('mqttClientIpMap',   onMqttMap);
    socket.on('mqttClientNameMap',  onClientNameMap);
    socket.on('wledFound',         onFound);
    socket.on('setupBuzz',        onSetupBuzz);
    socket.on('wledMqttProgress', onMqttProgress);
    socket.on('wledMqttDone',     onMqttDone);
    socket.on('wledMqttError',    onMqttError);

    // Listen for roster cleared events from QuickActions and clear local state
    const onRosterCleared = () => get().clearRoster();
    storeHub.onRosterCleared = onRosterCleared;
    window.addEventListener('buzzer:rosterCleared', onRosterCleared);
  },

  stopListeners: () => {
    const h = storeHub.handlers || {};
    try {
      if (h.onMqttMap) socket.off('mqttClientIpMap', h.onMqttMap);
      if (h.onClientNameMap) socket.off('mqttClientNameMap', h.onClientNameMap);
      if (h.onFound) socket.off('wledFound', h.onFound);
      if (h.onSetupBuzz) socket.off('setupBuzz', h.onSetupBuzz);
      if (h.onMqttProgress) socket.off('wledMqttProgress', h.onMqttProgress);
      if (h.onMqttDone) socket.off('wledMqttDone', h.onMqttDone);
      if (h.onMqttError) socket.off('wledMqttError', h.onMqttError);
    } catch (e) { /* ignore */ }
    try { if (storeHub.onSnapshot) socket.off('setupSnapshot', storeHub.onSnapshot); } catch (e) { /* ignore */ }
    try { window.removeEventListener('buzzer:rosterCleared', storeHub.onRosterCleared); } catch (e) { /* ignore */ }
    // clear timers
    const timers = storeHub.timers || {};
    Object.values(timers).forEach(clearTimeout);
    storeHub.timers = {};
    // abort any in-flight fetches
    const aborts = storeHub.abortControllers || {};
    Object.values(aborts).forEach(ac => {
      try { ac.abort(); } catch (e) { /* ignore */ }
    });
    storeHub.abortControllers = {};
    storeHub.handlers = {};
  },

  // Actions that mirror SetupScreen helpers and emit socket events
  setName: (hexId, name) => {
    set(st => ({ devices: { ...st.devices, [hexId]: { ...(st.devices[hexId] ?? {}), name } } }));
    socket.emit('setupNameChange', { hexId: hexId, name });
    persistSetup(get);
  },

  setIcon: (hexId, icon) => {
    set(st => ({ devices: { ...st.devices, [hexId]: { ...(st.devices[hexId] ?? {}), icon } } }));
    socket.emit('setupIconChange', { hexId, icon });
    persistSetup(get);
  },

  addAlias: (hexId, alias) => {
    set(st => {
      const d = st.devices[hexId] ?? { aliases: [] };
      if ((d.aliases ?? []).includes(alias)) return {};
      const nextAliases = [...(d.aliases ?? []), alias];
      const nextDevices = { ...st.devices, [hexId]: { ...d, aliases: nextAliases } };
      socket.emit('setupAliasChange', { hexId, aliases: nextAliases });
      return { devices: nextDevices };
    });
    persistSetup(get);
  },

  removeAlias: (hexId, alias) => {
    set(st => {
      const d = st.devices[hexId] ?? { aliases: [] };
      const nextAliases = (d.aliases ?? []).filter(a => a !== alias);
      const nextDevices = { ...st.devices, [hexId]: { ...d, aliases: nextAliases } };
      socket.emit('setupAliasChange', { hexId, aliases: nextAliases });
      return { devices: nextDevices };
    });
    persistSetup(get);
  },

  toggleActive: (hexId) => {
    set(st => {
      const cur = st.devices[hexId] ?? { active: false };
      const next = { ...st.devices, [hexId]: { ...cur, active: !cur.active } };
      socket.emit('setupActiveToggle', { hexId, active: !!next[hexId].active });
      return { devices: next };
    });
    persistSetup(get);
  },

  setColor: (hexId, color) => {
    set(st => {
      const nextColor = { ...(st.colorMap[hexId] ?? {}), color };
      const next = { ...st.colorMap, [hexId]: nextColor };
      socket.emit('setupColorChange', { hexId, color, useIndividual: !!nextColor.useIndividual });
      return { colorMap: next };
    });
    persistSetup(get);
  },

  resetColor: (hexId, defaultColor) => {
    set(st => {
      const cur = st.colorMap[hexId] ?? { useIndividual: false, color: defaultColor };
      const next = { ...st.colorMap, [hexId]: { ...cur, color: defaultColor } };
      socket.emit('setupColorChange', { hexId, color: defaultColor, useIndividual: !!next[hexId].useIndividual });
      return { colorMap: next };
    });
    persistSetup(get);
  },

  toggleIndividual: (hexId, defaultColor) => {
    set(st => {
      const cur = st.colorMap[hexId] ?? { useIndividual: false, color: defaultColor ?? null };
      const next = { ...st.colorMap, [hexId]: { ...cur, useIndividual: !cur.useIndividual } };
      socket.emit('setupColorChange', { hexId, color: next[hexId].color, useIndividual: next[hexId].useIndividual });
      return { colorMap: next };
    });
    persistSetup(get);
  },

  pushMqtt: (ip) => {
    set(st => ({ mqttStatus: { ...st.mqttStatus, [ip]: 'running' }, mqttLog: { ...st.mqttLog, [ip]: 'Sending…' } }));
    socket.emit('wledPushMqtt', { ip });
  },

}));

// Derived selector helpers (usable with `useSetupStore(select...)`)
// Cache results keyed by the `devices` object reference so the selector
// returns a stable reference when underlying devices haven't changed.
const _selectCaches = {
  mqttDevices: new WeakMap(),
  scanOnly: new WeakMap(),
  activeBuzzers: new WeakMap(),
  allAssignedAliases: new WeakMap(),
};

export const selectMqttDevices = s => {
  const devRef = s.devices || {};
  const cache = _selectCaches.mqttDevices;
  if (cache.has(devRef)) return cache.get(devRef);
  const val = Object.entries(devRef).filter(([k]) => !k.startsWith('ip:'));
  cache.set(devRef, val);
  return val;
};

export const selectScanOnly = s => {
  const devRef = s.devices || {};
  const cache = _selectCaches.scanOnly;
  if (cache.has(devRef)) return cache.get(devRef);
  const val = Object.entries(devRef).filter(([k]) => k.startsWith('ip:'));
  cache.set(devRef, val);
  return val;
};

export const selectActiveBuzzers = s => {
  const devRef = s.devices || {};
  const cache = _selectCaches.activeBuzzers;
  if (cache.has(devRef)) return cache.get(devRef);
  const val = Object.values(devRef).filter(d => d.hexId && d.active);
  cache.set(devRef, val);
  return val;
};

export const selectAllAssignedAliases = s => {
  const devRef = s.devices || {};
  const cache = _selectCaches.allAssignedAliases;
  if (cache.has(devRef)) return cache.get(devRef);
  const val = new Set(Object.values(devRef).flatMap(d => d.aliases ?? []));
  cache.set(devRef, val);
  return val;
};
