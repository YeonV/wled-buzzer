/**
 * standaloneStorage.js — IndexedDB wrapper for the standalone QuestionsEditor.
 *
 * Database: "qe-standalone" with three object stores:
 *   sets   — { name, questions[], loopNames{}, createdAt }
 *   images — { key, blob, mimeType }
 *   audio  — { key, blob }
 *
 * Image/audio references in questions use virtual paths:
 *   idb://images/{setName}/{timestamp}_{filename}
 *   idb://audio/{setName}/loop{n}
 */

const DB_NAME    = 'qe-standalone';
const DB_VERSION = 1;

let dbPromise = null;

// ── Object URL lifecycle ────────────────────────────────────────────────────
const objectUrls = new Map();  // key -> objectURL

function trackUrl(key, url) {
  const old = objectUrls.get(key);
  if (old) URL.revokeObjectURL(old);
  objectUrls.set(key, url);
  return url;
}

export function revokeAll() {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
}

// ── Open DB ─────────────────────────────────────────────────────────────────
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sets'))   db.createObjectStore('sets',   { keyPath: 'name' });
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('audio'))  db.createObjectStore('audio',  { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode = 'readonly') {
  return openDB().then(db => db.transaction(store, mode).objectStore(store));
}

function req(idbReq) {
  return new Promise((resolve, reject) => {
    idbReq.onsuccess = () => resolve(idbReq.result);
    idbReq.onerror   = () => reject(idbReq.error);
  });
}

// ── Sets ────────────────────────────────────────────────────────────────────
export async function listSets() {
  const store = await tx('sets');
  const all   = await req(store.getAll());
  const names = all.map(s => s.name).sort((a, b) => {
    if (a === 'built-in') return -1;
    if (b === 'built-in') return 1;
    return a.localeCompare(b);
  });
  return names;
}

export async function loadSet(name) {
  const store  = await tx('sets');
  const record = await req(store.get(name));
  if (!record) return { questions: [], loopNames: {} };
  return { questions: record.questions ?? [], loopNames: record.loopNames ?? {} };
}

export async function saveSet(name, questions, loopNames) {
  const store = await tx('sets', 'readwrite');
  const existing = await req(store.get(name));
  await req(store.put({
    name,
    questions,
    loopNames: loopNames ?? existing?.loopNames ?? {},
    createdAt: existing?.createdAt ?? Date.now(),
  }));
}

export async function deleteSet(name) {
  const store = await tx('sets', 'readwrite');
  await req(store.delete(name));
  // Cascade: delete images and audio for this set
  await deleteImagesForSet(name);
  await deleteAudioForSet(name);
}

export async function ensureBuiltIn() {
  const store  = await tx('sets');
  const record = await req(store.get('built-in'));
  if (!record) {
    const ws = await tx('sets', 'readwrite');
    await req(ws.put({ name: 'built-in', questions: [], loopNames: {}, createdAt: Date.now() }));
  }
}

// ── Images ──────────────────────────────────────────────────────────────────
export async function saveImage(setName, file) {
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
  const key = `${setName}/${Date.now()}_${sanitized}`;
  const store = await tx('images', 'readwrite');
  await req(store.put({ key, blob: file, mimeType: file.type }));
  return `idb://images/${key}`;
}

export async function saveImageBlob(setName, filename, blob, mimeType) {
  const key = `${setName}/${filename}`;
  const store = await tx('images', 'readwrite');
  await req(store.put({ key, blob, mimeType: mimeType ?? 'image/png' }));
  return `idb://images/${key}`;
}

export async function getImageUrl(virtualPath) {
  const key = virtualPath.replace(/^idb:\/\/images\//, '');
  const cached = objectUrls.get(virtualPath);
  if (cached) return cached;
  const store  = await tx('images');
  const record = await req(store.get(key));
  if (!record) return '';
  const url = URL.createObjectURL(record.blob);
  return trackUrl(virtualPath, url);
}

export async function getImageRecord(virtualPath) {
  const key   = virtualPath.replace(/^idb:\/\/images\//, '');
  const store = await tx('images');
  return req(store.get(key));
}

async function deleteImagesForSet(setName) {
  const store  = await tx('images', 'readwrite');
  const allKeys = await req(store.getAllKeys());
  for (const key of allKeys) {
    if (key.startsWith(`${setName}/`)) {
      await req(store.delete(key));
      const vp = `idb://images/${key}`;
      if (objectUrls.has(vp)) { URL.revokeObjectURL(objectUrls.get(vp)); objectUrls.delete(vp); }
    }
  }
}

// ── Audio ───────────────────────────────────────────────────────────────────
export async function saveAudio(setName, n, file) {
  const key = `${setName}/loop${n}`;
  const store = await tx('audio', 'readwrite');
  await req(store.put({ key, blob: file }));
}

export async function saveAudioBlob(setName, n, blob) {
  const key = `${setName}/loop${n}`;
  const store = await tx('audio', 'readwrite');
  await req(store.put({ key, blob }));
}

export async function getAudioUrl(setName, n) {
  const key = `${setName}/loop${n}`;
  const vp  = `idb://audio/${key}`;
  const cached = objectUrls.get(vp);
  if (cached) return cached;
  const store  = await tx('audio');
  const record = await req(store.get(key));
  if (!record) return '';
  const url = URL.createObjectURL(record.blob);
  return trackUrl(vp, url);
}

export async function getAudioRecord(setName, n) {
  const key   = `${setName}/loop${n}`;
  const store = await tx('audio');
  return req(store.get(key));
}

export async function listLoops(setName) {
  const store   = await tx('audio');
  const allKeys = await req(store.getAllKeys());
  const prefix  = `${setName}/loop`;
  const nums    = [];
  for (const key of allKeys) {
    if (key.startsWith(prefix)) {
      const n = parseInt(key.slice(prefix.length), 10);
      if (Number.isFinite(n) && n >= 1) nums.push(n);
    }
  }
  return nums.sort((a, b) => a - b);
}

export async function deleteLoop(setName, n) {
  const key = `${setName}/loop${n}`;
  const store = await tx('audio', 'readwrite');
  await req(store.delete(key));
  const vp = `idb://audio/${key}`;
  if (objectUrls.has(vp)) { URL.revokeObjectURL(objectUrls.get(vp)); objectUrls.delete(vp); }
}

async function deleteAudioForSet(setName) {
  const store   = await tx('audio', 'readwrite');
  const allKeys = await req(store.getAllKeys());
  for (const key of allKeys) {
    if (key.startsWith(`${setName}/`)) {
      await req(store.delete(key));
      const vp = `idb://audio/${key}`;
      if (objectUrls.has(vp)) { URL.revokeObjectURL(objectUrls.get(vp)); objectUrls.delete(vp); }
    }
  }
}
