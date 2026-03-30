import { useMemo, useState, useRef, useEffect } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import AuraCanvases from './AuraCanvases';
import { fetchAvatarList, invalidateAvatarCache, getAvatarCache, nameToAvatarFile, avatarUrl, onAvatarsChanged } from '../utils/avatarHelpers';

// Lazy-load: full library only when the picker is opened
let _Icons = null;
let _iconsPromise = null;
function loadAllIcons() {
  if (_Icons) return Promise.resolve(_Icons);
  if (_iconsPromise) return _iconsPromise;
  _iconsPromise = import('lucide-react').then(mod => { _Icons = mod; return _Icons; });
  return _iconsPromise;
}

// Load a single icon by PascalCase key — tiny individual chunk, not the whole library
const _singleCache = {};
async function loadSingleIcon(key) {
  if (!key) return null;
  if (_singleCache[key]) return _singleCache[key];
  // Already have the full library? Just use it
  if (_Icons?.[key]) { _singleCache[key] = _Icons[key]; return _Icons[key]; }
  try {
    // Import the full library and grab the one we need
    const mod = await import('lucide-react');
    const Comp = mod[key] ?? null;
    if (Comp) _singleCache[key] = Comp;
    return Comp;
  } catch { return null; }
}

// Minimal universal icon picker and viewer.
// Props:
// - name: string used to try to auto-detect a default icon from the name
// - edit: when true render the picker UI
// - icon: optional explicit icon key (Lucide export name, e.g. 'AlarmClock')
// - onChange: callback called with selected icon key (Lucide export name)

// Legacy mapping for the old 4 German suit names -> lucide export keys
const LEGACY_SUIT_MAP = {
  kreuz: ['Club', 'Clubs', 'SuitClub'],
  pik:   ['Spade', 'Spades', 'SuitSpade'],
  herz:  ['Heart', 'SuitHeart'],
  karo:  ['Diamond', 'SuitDiamond'],
};

const resolveLegacySuit = (s) => {
  if (!s) return null;
  const key = s.toLowerCase().trim();
  const candidates = LEGACY_SUIT_MAP[key];
  if (!candidates) return null;
  return candidates[0] ?? null;
};

const imageStyleToRadius = (imageStyle) => {
  if (imageStyle === 'plain') return 0;
  if (imageStyle === 'circle') return '50%';
  return 6;
};

// Helper: derive a PascalCase candidate from an arbitrary name
const nameToPascal = (s) => {
  if (!s) return '';
  const parts = s.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/);
  if (parts.length === 0) return '';
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
};


const PICKER_ITEM_STYLE = {
  padding: 2,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  background: 'transparent',
  border: 'none',
  color: 'inherit',
};

const MENU_WIDTH = 320;
const MENU_HEIGHT = 300; // px
const ITEM_SIZE = 40;   // px tile
const COLS = 8;

// Props:
// - aura: when true wraps the view-mode avatar in AnimatedAuraAvatar
//   For image avatars the full silhouette glow is applied; for icon avatars
//   the conic energy rings + sparks render around the icon (no silhouette mask).
//   When aura is true, `size` becomes the outer aura diameter in px.
// - auraColor: CSS colour string passed to AnimatedAuraAvatar (default '#39ff6a')
export default function SuitAvatar({ name = '', edit = false, icon = null, onChange = null, size = 16, variant = 'filled', imageStyle = 'rounded', aura = false, auraColor = '#39ff6a' }) {
  const [Icons, setIcons] = useState(_Icons);
  const [singleIcon, setSingleIcon] = useState(null); // { key, Component }
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [avatarFiles, setAvatarFiles] = useState(getAvatarCache() ?? []);
  const rootRef = useRef(null);

  // On mount: fetch avatar list + subscribe to pack changes
  useEffect(() => {
    let cancelled = false;
    fetchAvatarList().then(list => { if (!cancelled) setAvatarFiles(list); });
    const unsub = onAvatarsChanged((files) => { if (!cancelled) setAvatarFiles(files); });
    return () => { cancelled = true; unsub(); };
  }, []);

  // Load single icon when icon prop points to a lucide key (tiny chunk, not full library)
  useEffect(() => {
    if (Icons || !icon || icon.startsWith('avatar:')) return;
    loadSingleIcon(icon).then(Comp => {
      if (Comp) setSingleIcon({ key: icon, Component: Comp });
    });
  }, [icon, Icons]);

  // Full library: only when the picker opens (edit mode)
  useEffect(() => {
    if (!open || Icons) return;
    loadAllIcons().then(mod => setIcons(mod));
  }, [open, Icons]);

  // Close popover on click-away or ESC
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e) => { if (!rootRef.current) return; if (!rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  // Refresh avatar list when opening the picker (in case new uploads happened)
  useEffect(() => {
    if (!open) return undefined;
    invalidateAvatarCache();
    let cancelled = false;
    fetchAvatarList().then(list => { if (!cancelled) setAvatarFiles(list); });
    return () => { cancelled = true; };
  }, [open]);

  // Delete an uploaded avatar (right-click)
  const handleDeleteAvatar = async (e, filename) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete avatar "${filename}"? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/avatars/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        window.alert(`Failed to delete avatar: ${j.error || r.status}`);
        return;
      }
      invalidateAvatarCache();
      setAvatarFiles(prev => (prev || []).filter(f => f !== filename));
    } catch {
      window.alert('Failed to delete avatar');
    }
  };

  // Build list of available lucide icons (export name -> component)
  const ICON_ENTRIES = useMemo(() =>
    Icons ? Object.entries(Icons)
      .filter(([k, v]) => (typeof v === 'function' || typeof v === 'object') && /^[A-Z]/.test(k))
      .sort((a, b) => a[0].localeCompare(b[0])) : []
  , [Icons]);

  // Resolve the icon key to use (priority: explicit icon -> avatar file match by name -> lucide icon match -> null)
  const resolvedKey = useMemo(() => {
    if (icon && (Icons?.[icon] || singleIcon?.key === icon || icon.startsWith('avatar:'))) return icon;
    const legacyFromIcon = resolveLegacySuit(icon);
    if (legacyFromIcon) return legacyFromIcon;
    // Auto-match player name to uploaded avatar file (e.g. "Lorain" -> "Lorain.png")
    const avatarFile = nameToAvatarFile(name, avatarFiles);
    if (avatarFile) return `avatar:${avatarFile}`;
    const cand = nameToPascal(name);
    const legacyFromName = resolveLegacySuit(name);
    if (legacyFromName) return legacyFromName;
    if (cand && (Icons?.[cand] || singleIcon?.key === cand)) return cand;
    return null;
  }, [icon, name, avatarFiles, Icons, singleIcon]);

  // Load single icon for auto-resolved keys (e.g. name "Herz" -> resolvedKey "Heart")
  useEffect(() => {
    if (Icons || !resolvedKey || resolvedKey.startsWith('avatar:')) return;
    if (singleIcon?.key === resolvedKey) return;
    loadSingleIcon(resolvedKey).then(Comp => {
      if (Comp) setSingleIcon({ key: resolvedKey, Component: Comp });
    });
  }, [resolvedKey, Icons, singleIcon]);

  const CurrentIcon = resolvedKey
    ? (Icons?.[resolvedKey] ?? (singleIcon?.key === resolvedKey ? singleIcon.Component : null))
    : null;

  // Support image avatars set as `avatar:<filename>` (explicit or auto-matched)
  const avatarMatch = typeof resolvedKey === 'string' && resolvedKey.startsWith('avatar:') ? resolvedKey.slice(7) : null;

  const isFilled = variant === 'filled';
  if (!edit) {
    const boxStyle = { width: size, height: size, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', position: 'relative' };
    const content = avatarMatch ? (
      <img
        key={avatarUrl(avatarMatch)}
        className="suit-avatar suit-avatar--img"
        src={avatarUrl(avatarMatch)}
        alt=""
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: imageStyleToRadius(imageStyle), position: 'relative', zIndex: 2, filter: aura ? `drop-shadow(0 0 6px ${auraColor}60)` : undefined }}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    ) : CurrentIcon ? (
      <span style={{ position: 'relative', zIndex: 2, filter: aura ? `drop-shadow(0 0 6px ${auraColor}60)` : undefined }}>
        <CurrentIcon size={Math.round(size * 0.55)} fill={isFilled ? 'currentColor' : 'none'} stroke={isFilled ? 'none' : 'currentColor'} />
      </span>
    ) : null;
    if (!content) return null;
    return (
      <span style={boxStyle}>
        {aura && <AuraCanvases auraColor={auraColor} />}
        {content}
      </span>
    );
  }

  // Edit mode: render a toggle + a searchable icon popover with react-window virtualization
  const q = (filter || '').toLowerCase();
  const iconItems = ICON_ENTRIES.filter(([k]) => k.toLowerCase().includes(q));
  const imageItems = (avatarFiles || []).filter(f => f.toLowerCase().includes(q));
  const totalItems = imageItems.length + iconItems.length;
  const rowCount = Math.max(1, Math.ceil(totalItems / COLS));
  const columnWidth = Math.floor(MENU_WIDTH / COLS);

  return (
    <div className="suit-picker" ref={rootRef}>
      <button
        type="button"
        className="btn btn--icon btn--ghost btn--small"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        title={resolvedKey || 'Pick icon'}
      >
        {avatarMatch ? (
          <img
            key={avatarUrl(avatarMatch)}
            src={avatarUrl(avatarMatch)}
            alt=""
            style={{ width: size, height: size, objectFit: 'cover', borderRadius: imageStyleToRadius(imageStyle) }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : CurrentIcon ? (
          <CurrentIcon size={size} />
        ) : (
          Icons?.ChevronDown
            ? <Icons.ChevronDown size={size} />
            : <svg width={size} height={size} viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
        )}
      </button>

      {open && (
        <div role="menu" className="suit-picker-menu" style={{ width: MENU_WIDTH }}>
          <div className="suit-picker-search">
            <input autoFocus placeholder="Filter icons…" value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          <div className="suit-picker-viewport" style={{ height: MENU_HEIGHT, overflow: 'hidden' }}>
            <Grid
              columnCount={COLS}
              columnWidth={columnWidth}
              height={MENU_HEIGHT}
              rowCount={rowCount}
              rowHeight={ITEM_SIZE}
              width={MENU_WIDTH}
            >
              {({ columnIndex, rowIndex, style }) => {
                const idx = rowIndex * COLS + columnIndex;
                if (idx >= totalItems) return null;

                if (idx < imageItems.length) {
                  const filename = imageItems[idx];
                  return (
                    <div style={{ ...style, padding: 6 }} key={`avatar:${filename}`}>
                      <button
                        type="button"
                        className="suit-picker-item"
                        onClick={() => { onChange?.(`avatar:${filename}`); setOpen(false); }}
                        onContextMenu={(e) => handleDeleteAvatar(e, filename)}
                        title={filename}
                        style={{ ...PICKER_ITEM_STYLE, width: `${size}px`, height: `${size}px` }}
                      >
                        <img
                          src={avatarUrl(filename)}
                          alt=""
                          style={{ width: size, height: size, objectFit: 'cover', borderRadius: imageStyleToRadius(imageStyle) }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      </button>
                    </div>
                  );
                }

                const [key, Comp] = iconItems[idx - imageItems.length];
                return (
                  <div style={{ ...style, padding: 6 }} key={key}>
                    <button
                      type="button"
                      className="suit-picker-item"
                      onClick={() => { onChange?.(key); setOpen(false); }}
                      title={key}
                      style={{ ...PICKER_ITEM_STYLE, width: `${size}px`, height: `${size}px` }}
                    >
                      <Comp size={size} fill={isFilled ? 'currentColor' : 'none'} stroke={isFilled ? 'none' : 'currentColor'} />
                    </button>
                  </div>
                );
              }}
            </Grid>
          </div>
        </div>
      )}
    </div>
  );
}
