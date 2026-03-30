export const LS_ROSTER = 'buzzer-roster';

export const PALETTE = [
  '#cc1515',  // 1  red (example)
  '#00aa3c',  // 2  green (example)
  '#ff8800',  // 3  orange
  '#0050ff',  // 4  blue
  '#ff00ae',  // 5  hot pink
  '#00aacc',  // 6  teal
  '#9b00ff',  // 7  purple
  '#ff77cc',  // 14 bubblegum
  '#e6c800',  // 8  gold
  '#0088ff',  // 9  sky blue
  '#ff5599',  // 10 rose
  '#00ccaa',  // 11 mint
  '#cc6600',  // 12 burnt orange
  '#7744ff',  // 13 indigo
  '#3399cc',  // 15 steel blue
  '#cc44ff',  // 16 violet
  '#ffaa33',  // 17 amber
  '#5577ff',  // 18 periwinkle
];

export function loadRoster(key = LS_ROSTER) {
  try { return JSON.parse(sessionStorage.getItem(key) ?? '[]'); } catch { return []; }
}

export function mergeDevice(prev, key, data) {
  return { ...prev, [key]: { ...(prev[key] ?? {}), ...data } };
}

export function upgradeIpKey(prev, ip, hexId, savedRoster) {
  const ipKey = `ip:${ip}`;
  if (!prev[ipKey]) return prev;
  const { [ipKey]: old, ...rest } = prev;
  const saved = (savedRoster || []).find(r => r.hexId === hexId);
  return {
    ...rest,
    [hexId]: {
      ...old,
      hexId,
      ip,
      name:   saved?.name   ?? old.name   ?? '',
      active: saved?.active ?? old.active ?? false,
    },
  };
}

export function emitSnapshot(devMap, socket, colorMap = {}) {
  const snap = {};
  for (const [key, d] of Object.entries(devMap)) {
    if (!d.hexId) continue;
    snap[key] = { name: d.name, wledName: d.wledName, active: !!d.active, icon: d.icon ?? undefined };
    const col = colorMap[key];
    if (col) { snap[key].color = col.color; snap[key].useIndividual = !!col.useIndividual; }
  }
  if (Object.keys(snap).length > 0) socket.emit('setupSnapshot', snap);
}

export function getAccentColor(index, fallbackPalette = []) {
  try {
    const val = getComputedStyle(document.documentElement).getPropertyValue('--c-accent') || '';
    const v = val.trim();
    if (v) return v;
  } catch { /* ignore */ }
  return fallbackPalette[index % (fallbackPalette.length || 1)];
}

export function buildInitialDevices(savedRoster = [], initialMqttMap = {}) {
  const map = {};
  for (const r of savedRoster) {
    map[r.hexId] = {
      hexId:    r.hexId,
      ip:       r.ip,
      name:     r.name,
      active:   r.active,
      aliases:  r.aliases ?? [],
      icon:     r.icon ?? undefined,
      wledName: '',
      fw:       '',
      mac:      '',
      buzzing:  false,
    };
  }
  for (const [hexId, ip] of Object.entries(initialMqttMap || {})) {
    if (map[hexId]) {
      map[hexId].ip = ip;
    } else {
      const saved_entry = (savedRoster || []).find(r => r.hexId === hexId);
      map[hexId] = {
        hexId,
        ip,
        name:     saved_entry?.name   ?? '',
        active:   saved_entry?.active ?? false,
        aliases:  saved_entry?.aliases ?? [],
        wledName: '',
        fw:       '',
        mac:      '',
        buzzing:  false,
      };
    }
  }
  return map;
}
