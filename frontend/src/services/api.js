export async function fetchQuestions() {
  const res = await fetch('/questions.json');
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchQuestionSets(baseUrl) {
  const res = await fetch(`${baseUrl}/api/question-sets`);
  if (!res.ok) return { sets: [], active: null };
  const data = await res.json();
  return {
    sets: Array.isArray(data?.sets) ? data.sets : [],
    active: data?.active ?? null,
  };
}

export async function activateQuestionSet(baseUrl, name) {
  await fetch(`${baseUrl}/api/question-sets/${encodeURIComponent(name)}/activate`, { method: 'POST' });
}

export async function fetchLoops() {
  const res = await fetch('/api/loops');
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchVideos() {
  const res = await fetch('/api/videos');
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchLoopNames() {
  const res = await fetch('/api/loop-names');
  if (!res.ok) return {};
  const data = await res.json();
  return (data && typeof data === 'object') ? data : {};
}

export async function fetchResultsList(baseUrl) {
  const res = await fetch(`${baseUrl}/api/results`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchResultFile(baseUrl, filename) {
  const res = await fetch(`${baseUrl}/api/results/${encodeURIComponent(filename)}`);
  if (!res.ok) return null;
  return res.json();
}

// ─── Pack API ────────────────────────────────────────────────────────────────

export async function fetchPacks(baseUrl) {
  const res = await fetch(`${baseUrl}/api/packs`);
  if (!res.ok) return { packs: [], active: {} };
  return res.json();
}

export async function activatePacks(baseUrl, { avatars, questions }) {
  const body = {};
  if (avatars) body.avatars = avatars;
  if (questions) body.questions = questions;
  await fetch(`${baseUrl}/api/packs/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deletePack(baseUrl, name) {
  await fetch(`${baseUrl}/api/packs/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export async function createPack(baseUrl, name) {
  const res = await fetch(`${baseUrl}/api/packs/${encodeURIComponent(name)}/create`, { method: 'POST' });
  return res.json();
}

export async function peekPack(baseUrl, data) {
  const res = await fetch(`${baseUrl}/api/packs/peek`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function importPack(baseUrl, name, data, selected) {
  await fetch(`${baseUrl}/api/packs/${encodeURIComponent(name)}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, selected }),
  });
}

export async function fetchAvatarPacks(baseUrl) {
  const res = await fetch(`${baseUrl}/api/avatar-packs`);
  if (!res.ok) return { packs: [], active: null };
  return res.json();
}

export async function activateAvatarPack(baseUrl, name) {
  // Backend emits 'activePacksChanged' after writing, which triggers refreshAvatars via socketBridge
  await fetch(`${baseUrl}/api/avatar-packs/${encodeURIComponent(name)}/activate`, { method: 'POST' });
}
