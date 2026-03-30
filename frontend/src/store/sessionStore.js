/* eslint-disable no-unused-vars */
// Session-level state: player roster, names, UI overlays, UI settings
import { create } from 'zustand';
// nameMap + seenIds are now server-authoritative (sent via displayNames + buzzerRoster)
// No sessionStorage persistence needed for these.
import { useGameStore } from './gameStore';
import { LS_ROSTER, PALETTE } from '../utils/setupHelpers';

// Apply initial theme to DOM on module load (reactive updates handled by socketBridge 'theme' event)
const _initTheme = sessionStorage.getItem('buzzer-theme') ?? 'crystal';
document.documentElement.setAttribute('data-theme', _initTheme === 'default' ? '' : _initTheme);

export const useSessionStore = create((set, get) => ({
  // ── Player roster ─────────────────────────────────────────────────────
  nameMap:  {},
  iconMap:  {},
  seenIds:  [],
  draft:    {},
  draftScores: {},

  // ── App-level UI ──────────────────────────────────────────────────────
  hasInteracted:        false,   // display starts true via init
  showSettings:         false,
  showDiscovery:        false,
  showQuestionsEditor:  false,
  showFinalScreen:      false,
  statsOpen:            false,
  saveMsg:              null,
  bladeLockToast:       null,
  _bladeLockTimer:      null,
  roundHistory:         [],
  pastFiles:            null,
  loadedPastGame:       null,
  availableLoops:       [1, 2, 3],
  loopNames:            {},
  availableVideos:      [],
  playingVideo:         null,
  zoomedImage:          null,
  activeAvatarPack:     'default',
  showSetupSettings:    false,
  showPackManager:      false,
  pendingPackImport:    null,

  // ── App settings ──────────────────────────────────────────────────────
  theme:         sessionStorage.getItem('buzzer-theme') ?? 'crystal',
  scoreboardPos: sessionStorage.getItem('buzzer-scoreboard-pos') ?? 'bottom',
  scoreboardTopN: 0,
  scoreboardShowGaps: false,
  // Avatar appearance (size in px, variant 'filled'|'outlined')
  avatarSize: Number(sessionStorage.getItem('buzzer-avatar-size') ?? 28),
  avatarVariant: sessionStorage.getItem('buzzer-avatar-variant') ?? 'outlined',
  // Image style for uploaded avatars: 'plain'|'rounded'|'circle'
  avatarImageStyle: sessionStorage.getItem('buzzer-avatar-image-style') ?? 'rounded',
  // When true, main display only shows the buzzed player (winner spotlight)
  scoreboardActiveOnly: sessionStorage.getItem('buzzer-scoreboard-active-only') === 'true',
  // Scoreboard view variant: 'default' | 'blade'
  scoreboardVariant: sessionStorage.getItem('buzzer-scoreboard-variant') ?? 'default',

  // Dev helpers
  devmode: false,

  // ── Helpers ───────────────────────────────────────────────────────────
  setNameMap(v) { set({ nameMap: typeof v === 'function' ? v(get().nameMap) : v }); },
  setIconMap(v) { set({ iconMap: typeof v === 'function' ? v(get().iconMap) : v }); },
  setSeenIds(v) { set({ seenIds: typeof v === 'function' ? v(get().seenIds) : v }); },
  setDraft(v)   { set({ draft: typeof v === 'function' ? v(get().draft) : v }); },
  setDraftScores(v) { set({ draftScores: typeof v === 'function' ? v(get().draftScores) : v }); },

  openSettings() {
    const { nameMap } = get();
    const scores = useGameStore.getState().scores;
    set({ draft: { ...nameMap }, draftScores: { ...scores }, showSettings: true });
  },

  saveNames(socket) {
    const { draft, draftScores } = get();
    const cleaned = Object.fromEntries(Object.entries(draft).filter(([, v]) => v.trim() !== ''));
    set({ nameMap: cleaned, showSettings: false });
    socket.emit('setDisplayNames', cleaned);
    const newScores = Object.fromEntries(Object.entries(draftScores).map(([k, v]) => [k, Number(v) || 0]));
    socket.emit('setScores', newScores);
  },

  setAvatarSize(size) {
    const s = Number(size) || 28;
    try { sessionStorage.setItem('buzzer-avatar-size', String(s)); } catch { /* ignore */ }
    set({ avatarSize: s });
  },

  setAvatarVariant(v) {
    const variant = v === 'filled' ? 'filled' : 'outlined';
    try { sessionStorage.setItem('buzzer-avatar-variant', variant); } catch { /* ignore */ }
    set({ avatarVariant: variant });
  },

  setAvatarImageStyle(style) {
    const s = (style === 'plain' || style === 'rounded' || style === 'circle') ? style : 'rounded';
    try { sessionStorage.setItem('buzzer-avatar-image-style', s); } catch { /* ignore */ }
    set({ avatarImageStyle: s });
  },

  // Dev mode helpers
  setDevMode(v) { set({ devmode: !!v }); },
  toggleDevMode() { set(s => ({ devmode: !s.devmode })); },

  addRow() {
    const key = `device-${Date.now()}`;
    set(s => {
      const seenIds = s.seenIds.includes(key) ? s.seenIds : [...s.seenIds, key];
      return { draft: { ...s.draft, [key]: '' }, seenIds };
    });
  },

  removeRow(id) {
    set(s => {
      const seenIds = s.seenIds.filter(x => x !== id);
      const draft = { ...s.draft };
      delete draft[id];
      return { draft, seenIds };
    });
  },

  handleStart(roster, socket) {
    const names = {};
    const icons = {};
    for (const { hexId, name } of roster) { if (name.trim()) names[hexId] = name.trim(); }
    for (const { hexId, icon } of roster) { if (icon) icons[hexId] = icon; }
    const merged = { ...get().nameMap, ...names };
    const rosterIds = roster.map(r => r.hexId);
    set({ nameMap: merged, iconMap: { ...get().iconMap, ...icons }, seenIds: rosterIds, hasInteracted: true });
    socket.emit('setBuzzerRoster', roster);
    // presetsReady lives in gameStore — caller sets it via gameStore
  },

  // Build roster & persist full device state, then delegate to handleStart
  startFromSetup(devices, addonSel, colorMap, socket) {
    const activeBuzzers = Object.values(devices).filter(d => d.hexId && d.active);
    const hexToRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const roster = activeBuzzers.map(({ hexId, ip, name, wledName, aliases, icon }, i) => {
      const effectiveName = name || wledName || hexId;
      const colEntry = colorMap[hexId];
      const colorHex = colEntry?.useIndividual ? colEntry.color : PALETTE[i % PALETTE.length];
      return {
        hexId, ip, name: effectiveName, aliases: aliases ?? [], goveeIds: addonSel[hexId] ?? [], icon: icon ?? undefined,
        color: hexToRgb(colorHex), useIndividual: !!colEntry?.useIndividual,
      };
    });
    // Persist full device state (including unticked) so we remember names on next open
    const full = Object.values(devices)
      .filter(d => d.hexId)
      .map(({ hexId, ip, name, active, aliases, icon }) => ({ hexId, ip, name, active, aliases: aliases ?? [], icon: icon ?? undefined }));
    try { sessionStorage.setItem(LS_ROSTER, JSON.stringify(full)); } catch (e) { /* ignore */ }
    get().handleStart(roster, socket);
    try { useGameStore.setState({ presetsReady: false }); } catch (e) { /* ignore */ }
  },

  // ── Socket handlers ───────────────────────────────────────────────────
  onGameStarted({ roster }) {
    if (!Array.isArray(roster) || roster.length === 0) return;
    const names = {};
    const icons = {};
    for (const { hexId, name } of roster) { if (name?.trim()) names[hexId] = name.trim(); }
    for (const { hexId, icon } of roster) { if (icon) icons[hexId] = icon; }
    const rosterIds = roster.map(r => r.hexId);
    set(s => {
      const nameMap = { ...s.nameMap, ...names };
      const iconMap = { ...(s.iconMap ?? {}), ...icons };
      return { nameMap, iconMap, seenIds: rosterIds, hasInteracted: true };
    });
  },

  onAvatarSettings(data) {
    if (!data) return;
    const size = Number(data.size) || get().avatarSize || 28;
    const variant = data.variant === 'filled' ? 'filled' : (data.variant === 'outlined' ? 'outlined' : get().avatarVariant ?? 'outlined');
    const imageStyle = (data.imageStyle === 'plain' || data.imageStyle === 'rounded' || data.imageStyle === 'circle') ? data.imageStyle : get().avatarImageStyle ?? 'rounded';
    try { sessionStorage.setItem('buzzer-avatar-size', String(size)); } catch { /* ignore */ }
    try { sessionStorage.setItem('buzzer-avatar-variant', variant); } catch { /* ignore */ }
    try { sessionStorage.setItem('buzzer-avatar-image-style', imageStyle); } catch { /* ignore */ }
    set({ avatarSize: size, avatarVariant: variant, avatarImageStyle: imageStyle });
  },

  onDisplayNames(data) {
    if (!data?.names) return;
    set(s => ({ nameMap: { ...s.nameMap, ...data.names } }));
  },

  onBladeLock({ name, count, penalty }) {
    clearTimeout(get()._bladeLockTimer);
    const t = setTimeout(() => set({ bladeLockToast: null, _bladeLockTimer: null }), 3500);
    set({ bladeLockToast: { name, count, penalty }, _bladeLockTimer: t });
  },

  onRoundHistory(data)      { set({ roundHistory: data ?? [] }); },
  onStatsOpen({ open })     { set({ statsOpen: open }); },
  onFinalScreen({ open })   { set({ showFinalScreen: open }); },
  onSaveResult(d) {
    const msg = d.ok ? `Saved: ${d.filename}` : `Error: ${d.msg}`;
    set({ saveMsg: msg });
    setTimeout(() => set({ saveMsg: null }), 4000);
  },
  onLoopNamesUpdated(names) {
    if (names && typeof names === 'object') set({ loopNames: names });
  },
}));
