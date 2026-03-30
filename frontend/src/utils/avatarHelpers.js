// Single shared avatar file cache — used by SuitAvatar and BuzzerCard
let _cache = null;
let _urlPrefix = '';
let _promise = null;
const _listeners = new Set();

export function fetchAvatarList() {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = fetch('/api/avatars')
    .then(r => r.ok ? r.json() : { files: [], urlPrefix: '' })
    .then(data => {
      // Support both old (array) and new ({ files, urlPrefix }) response formats
      if (Array.isArray(data)) {
        _cache = data;
        _urlPrefix = '';
      } else {
        _cache = Array.isArray(data.files) ? data.files : [];
        _urlPrefix = data.urlPrefix || '';
      }
      return _cache;
    })
    .catch(() => { _cache = []; _urlPrefix = ''; return _cache; });
  return _promise;
}

export function invalidateAvatarCache() { _cache = null; _urlPrefix = ''; _promise = null; }

/** Invalidate cache and refetch — call when avatar pack changes */
export async function refreshAvatars() {
  invalidateAvatarCache();
  await fetchAvatarList();
  for (const cb of _listeners) cb(_cache, _urlPrefix);
}

/** Register a callback fired after refreshAvatars completes. Returns unsubscribe function. */
export function onAvatarsChanged(cb) { _listeners.add(cb); return () => _listeners.delete(cb); }

export function getAvatarCache() { return _cache; }

/** Get the URL prefix for avatar images (e.g. "/uploads/packs/anime/avatars" or "/custom-packs/anime/avatars") */
export function getAvatarUrlPrefix() { return _urlPrefix; }

/** Build a full URL for an avatar filename */
export function avatarUrl(filename) {
  if (!filename) return '';
  return `${_urlPrefix}/${filename}`;
}

/** Try to match a player name to an uploaded avatar filename (case-insensitive) */
export function nameToAvatarFile(name, files) {
  if (!name || !files?.length) return null;
  const lower = name.toLowerCase().trim();
  return files.find(f => f.replace(/\.[^.]+$/, '').toLowerCase() === lower) ?? null;
}

/** Check if a given icon/name combo resolves to an avatar image */
export function hasAvatarImage(icon, name) {
  if (typeof icon === 'string' && icon.startsWith('avatar:')) return true;
  return !!nameToAvatarFile(name, _cache);
}
