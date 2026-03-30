'use strict';
const path    = require('path');
const fs      = require('fs');
const fsp     = require('fs').promises;
const express = require('express');
const AdmZip  = require('adm-zip');
const axios   = require('axios');

const ALLOWED_MIME = new Set(['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','image/avif']);
const ALLOWED_VIDEO_MIME = new Set(['video/mp4','video/webm','video/ogg']);

const exists = async (p) => fsp.access(p).then(() => true).catch(() => false);

function registerRoutes(app, { getIo, resetQuestionIndex, LEDFX_URL, LOOP_NAMES_PATH, RESULTS_DIR, UPLOADS_DIR, STATIC_DIR, ACTIVE_PACKS_PATH, CUSTOM_PACKS_DIR }) {

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const PACKS_DIR = path.join(UPLOADS_DIR, 'packs');
  const _safeName  = (n) => /^[a-zA-Z0-9_\- ]{1,64}$/.test(n);

  /** Resolve a pack directory — checks main packs first, then custom-packs (recursive) */
  const _packDir = (name) => {
    const main = path.join(PACKS_DIR, name);
    if (fs.existsSync(main)) return main;
    if (CUSTOM_PACKS_DIR) {
      const found = _findPackSync(CUSTOM_PACKS_DIR, name);
      if (found) return found;
    }
    return main;
  };

  /** Recursively find a pack by name (sync) */
  const _findPackSync = (dir, name) => {
    if (!fs.existsSync(dir)) return null;
    const direct = path.join(dir, name);
    if (fs.existsSync(direct) && fs.existsSync(path.join(direct, 'pack.json'))) return direct;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory() && !fs.existsSync(path.join(full, 'pack.json'))) {
        const found = _findPackSync(full, name);
        if (found) return found;
      }
    }
    return null;
  };

  /** Async version of _packDir */
  const _packDirAsync = async (name) => {
    const main = path.join(PACKS_DIR, name);
    if (await exists(main)) return main;
    if (CUSTOM_PACKS_DIR) {
      const found = await _findPackAsync(CUSTOM_PACKS_DIR, name);
      if (found) return found;
    }
    return main;
  };

  /** Recursively find a pack by name (async) */
  const _findPackAsync = async (dir, name) => {
    if (!(await exists(dir))) return null;
    const direct = path.join(dir, name);
    if (await exists(direct) && await exists(path.join(direct, 'pack.json'))) return direct;
    const entries = await fsp.readdir(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stat = await fsp.stat(full);
      if (stat.isDirectory() && !(await exists(path.join(full, 'pack.json')))) {
        const found = await _findPackAsync(full, name);
        if (found) return found;
      }
    }
    return null;
  };

  /** Check if a pack lives in custom-packs (read-only) */
  const _isCustomPack = (name) => {
    if (!CUSTOM_PACKS_DIR) return false;
    return !fs.existsSync(path.join(PACKS_DIR, name)) && fs.existsSync(path.join(CUSTOM_PACKS_DIR, name));
  };

  /** URL prefix for a pack's static files */
  const _packUrlPrefix = (name) => _isCustomPack(name) ? '/custom-packs' : '/uploads/packs';

  const _readActivePacks = async () => {
    try { return JSON.parse(await fsp.readFile(ACTIVE_PACKS_PATH, 'utf8')); }
    catch { return { avatars: 'default', questions: 'default' }; }
  };
  const _writeActivePacks = async (obj) => {
    await fsp.writeFile(ACTIVE_PACKS_PATH, JSON.stringify(obj, null, 2), 'utf8');
  };

  /** Return the questions/ subfolder for a pack */
  const _questionsDir = (pack) => path.join(_packDir(pack), 'questions');
  /** Return the avatars/ subfolder for a pack */
  const _avatarsDir   = (pack) => path.join(_packDir(pack), 'avatars');
  /** Return the pack-level videos/ subfolder */
  const _videosDir    = (pack) => path.join(_packDir(pack), 'videos');

  /** List all pack names from both directories (deduplicated, main wins) */
  const _allPackNames = async () => {
    const names = new Set();
    for (const dir of [PACKS_DIR, CUSTOM_PACKS_DIR]) {
      if (!dir || !(await exists(dir))) continue;
      await _scanPackDir(dir, names);
    }
    return [...names].sort();
  };

  /** Recursively scan for pack directories (those containing pack.json) */
  const _scanPackDir = async (dir, names) => {
    const entries = await fsp.readdir(dir);
    for (const n of entries) {
      const full = path.join(dir, n);
      const stat = await fsp.stat(full);
      if (!stat.isDirectory()) continue;
      if (await exists(path.join(full, 'pack.json'))) {
        names.add(n);
      } else {
        await _scanPackDir(full, names);
      }
    }
  };

  /** List packs that contain a specific content type (avatars|questions|videos) */
  const _packsWithContent = async (type) => {
    const allNames = await _allPackNames();
    const results = await Promise.all(allNames.map(async (n) => {
      const dir = path.join(await _packDirAsync(n), type);
      if (!(await exists(dir))) return null;
      const contents = await fsp.readdir(dir);
      return contents.length > 0 ? n : null;
    }));
    return results.filter(Boolean).sort();
  };

  /** Auto-derive includes array from pack folder contents */
  const _deriveIncludes = async (packName) => {
    const dir = await _packDirAsync(packName);
    const includes = [];
    const avatarsDir = path.join(dir, 'avatars');
    if (await exists(avatarsDir)) {
      const files = await fsp.readdir(avatarsDir);
      if (files.length > 0) includes.push('avatars');
    }
    if (await exists(path.join(dir, 'questions', 'questions.json'))) includes.push('questions');
    const videosDir = path.join(dir, 'videos');
    if (await exists(videosDir)) {
      const files = await fsp.readdir(videosDir);
      if (files.length > 0) includes.push('videos');
    }
    return includes;
  };

  // ─── Active-set audio intercept ────────────────────────────────────────────
  app.get('/uploads/audio-system/loop:n.mp3', async (req, res, next) => {
    const n = parseInt(req.params.n, 10);
    if (!Number.isFinite(n) || n < 1) return next();
    const active = await _readActivePacks();
    const setFile = path.join(_questionsDir(active.questions), 'audio', `loop${n}.mp3`);
    if (await exists(setFile)) return res.sendFile(setFile);
    res.status(404).end();
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  //  PACK MANAGEMENT API
  // ═══════════════════════════════════════════════════════════════════════════════

  // List all packs with their metadata (merges main + custom-packs)
  app.get('/api/packs', async (_req, res) => {
    try {
      await fsp.mkdir(PACKS_DIR, { recursive: true });
      const active = await _readActivePacks();
      const allNames = await _allPackNames();
      const packResults = await Promise.all(allNames.map(async (n) => {
        const dir = await _packDirAsync(n);
        let meta = { name: n, description: '', version: '1.0' };
        try { meta = { ...meta, ...JSON.parse(await fsp.readFile(path.join(dir, 'pack.json'), 'utf8')) }; } catch {}
        return { ...meta, id: n, includes: await _deriveIncludes(n), custom: _isCustomPack(n) };
      }));
      const packs = packResults.sort((a, b) => a.id.localeCompare(b.id));
      res.json({ packs, active });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Export a pack as ZIP (GET = full, query ?select=avatars,videos,questions for selective)
  app.get('/api/packs/:name/export', async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid pack name' });
    const dir = _packDir(name);
    if (!(await exists(dir))) return res.status(404).json({ error: 'Pack not found' });
    const selected = req.query.select ? req.query.select.split(',') : null;
    try {
      const zip = new AdmZip();
      // Always include pack.json and settings.json/mappings.json
      const metaFiles = ['pack.json', 'settings.json', 'mappings.json'];
      for (const mf of metaFiles) {
        const p = path.join(dir, mf);
        if (fs.existsSync(p)) zip.addLocalFile(p);
      }
      // Add selected content folders (or all if no selection)
      const folders = ['avatars', 'videos', 'questions'];
      for (const folder of folders) {
        if (selected && !selected.includes(folder)) continue;
        const folderPath = path.join(dir, folder);
        if (fs.existsSync(folderPath)) zip.addLocalFolder(folderPath, folder);
      }
      const buffer = zip.toBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}.zip"`);
      res.send(buffer);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Import a pack from ZIP
  app.post('/api/packs/:name/import', express.json({ limit: '256mb' }), async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid pack name' });
    const { data, selected } = req.body ?? {};
    if (typeof data !== 'string') return res.status(400).json({ error: 'Missing data field' });
    try {
      const dir = _packDir(name);
      await fsp.mkdir(dir, { recursive: true });
      const zip = new AdmZip(Buffer.from(data, 'base64'));
      // Detect subfolder prefix (e.g. "xeon-gameshow/pack.json")
      const allNames = zip.getEntries().map(e => e.entryName.replace(/\\/g, '/'));
      let importPrefix = '';
      if (!allNames.includes('pack.json')) {
        const pj = allNames.find(e => e.endsWith('/pack.json') || e.endsWith('pack.json'));
        if (pj) importPrefix = pj.replace('pack.json', '');
      }
      // Safe entry whitelist
      const safePattern = /^(pack\.json|settings\.json|mappings\.json|avatars\/[^/]+|videos\/[^/]+|questions\/questions\.json|questions\/audio\/[^/]+\.mp3|questions\/images\/[^/]+|questions\/videos\/[^/]+)$/i;
      for (const entry of zip.getEntries()) {
        let entryName = entry.entryName.replace(/\\/g, '/');
        if (importPrefix && entryName.startsWith(importPrefix)) entryName = entryName.slice(importPrefix.length);
        if (entry.isDirectory) continue;
        if (!safePattern.test(entryName)) continue;
        // If selective import, skip unselected content types
        if (Array.isArray(selected)) {
          if (entryName.startsWith('avatars/') && !selected.includes('avatars')) continue;
          if (entryName.startsWith('videos/') && !selected.includes('videos')) continue;
          if (entryName.startsWith('questions/') && !selected.includes('questions')) continue;
        }
        const dest = path.join(dir, entryName);
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.writeFile(dest, entry.getData());
      }
      // Always write pack.json if not in ZIP
      if (!(await exists(path.join(dir, 'pack.json')))) {
        await fsp.writeFile(path.join(dir, 'pack.json'), JSON.stringify({
          name, description: '', version: '1.0', includes: await _deriveIncludes(name)
        }, null, 2), 'utf8');
      }
      getIo().emit('packsUpdated');
      getIo().emit('questionsUpdated');
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Create an empty pack
  app.post('/api/packs/:name/create', async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid pack name' });
    const dir = _packDir(name);
    if (await exists(dir)) return res.status(409).json({ error: 'Pack already exists' });
    try {
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(path.join(dir, 'pack.json'), JSON.stringify({
        name, description: '', version: '1.0'
      }, null, 2), 'utf8');
      getIo().emit('packsUpdated');
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Delete a pack
  app.delete('/api/packs/:name', async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid pack name' });
    const dir = _packDir(name);
    if (!(await exists(dir))) return res.status(404).json({ error: 'Not found' });
    try {
      await fsp.rm(dir, { recursive: true, force: true });
      // Reset active packs if they referenced the deleted pack
      const active = await _readActivePacks();
      let changed = false;
      if (active.avatars === name) { active.avatars = 'default'; changed = true; }
      if (active.questions === name) { active.questions = 'default'; changed = true; }
      if (changed) await _writeActivePacks(active);
      getIo().emit('packsUpdated');
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Activate content from packs (selective)
  app.post('/api/packs/activate', async (req, res) => {
    const { avatars, questions } = req.body ?? {};
    try {
      const active = await _readActivePacks();
      if (avatars && _safeName(avatars)) active.avatars = avatars;
      if (questions && _safeName(questions)) {
        active.questions = questions;
        resetQuestionIndex();
        getIo().emit('questionIndex', { index: 0 });
        getIo().emit('questionsUpdated');
      }
      await _writeActivePacks(active);
      getIo().emit('activePacksChanged', active);
      res.json({ ok: true, active });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Peek inside a ZIP without importing (for the import dialog)
  app.post('/api/packs/peek', express.json({ limit: '256mb' }), async (req, res) => {
    const { data } = req.body ?? {};
    if (typeof data !== 'string') return res.status(400).json({ error: 'Missing data field' });
    try {
      const zip = new AdmZip(Buffer.from(data, 'base64'));
      let entries = zip.getEntries().map(e => e.entryName.replace(/\\/g, '/'));
      // Detect and strip common subfolder prefix (e.g. "xeon-gameshow/pack.json" → "pack.json")
      let prefix = '';
      if (!entries.includes('pack.json')) {
        const packEntry = entries.find(e => e.endsWith('/pack.json') || e.endsWith('pack.json'));
        if (packEntry) prefix = packEntry.replace('pack.json', '');
      }
      if (prefix) entries = entries.map(e => e.startsWith(prefix) ? e.slice(prefix.length) : e);
      let meta = { name: '', description: '', version: '1.0' };
      try {
        const packEntry = zip.getEntry(prefix + 'pack.json') || zip.getEntry('pack.json');
        if (packEntry) meta = { ...meta, ...JSON.parse(packEntry.getData().toString('utf8')) };
      } catch {}
      const avatars = entries.filter(e => e.startsWith('avatars/') && !e.endsWith('/'));
      const videos = entries.filter(e => e.startsWith('videos/') && !e.endsWith('/'));
      const questionFiles = entries.filter(e => e.startsWith('questions/') && !e.endsWith('/'));
      // Count actual question objects inside questions.json (not just file count)
      let questionCount = 0;
      try {
        const qEntry = zip.getEntry(prefix + 'questions/questions.json') || zip.getEntry('questions/questions.json');
        if (qEntry) {
          const parsed = JSON.parse(qEntry.getData().toString('utf8'));
          questionCount = Array.isArray(parsed) ? parsed.length : 0;
        }
      } catch {}
      res.json({
        meta,
        contents: {
          avatars: avatars.length,
          videos: videos.length,
          questions: questionCount || questionFiles.length,
        }
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  //  QUESTIONS API (operates on the questions subfolder of a pack)
  // ═══════════════════════════════════════════════════════════════════════════════

  // List packs that have questions
  app.get('/api/question-sets', async (_req, res) => {
    try {
      const active = await _readActivePacks();
      const sets = await _packsWithContent('questions');
      // Also include packs that have a questions.json even if the questions/ dir check missed it
      let moreSets = [];
      if (await exists(PACKS_DIR)) {
        const entries = await fsp.readdir(PACKS_DIR);
        const checks = await Promise.all(entries.map(async (n) => {
          const stat = await fsp.stat(path.join(PACKS_DIR, n));
          if (!stat.isDirectory()) return null;
          if (await exists(path.join(PACKS_DIR, n, 'questions', 'questions.json'))) return n;
          return null;
        }));
        moreSets = checks.filter(Boolean);
      }
      const all = [...new Set([...sets, ...moreSets])].sort();
      res.json({ sets: all, active: active.questions });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Activate a question set (shortcut for /api/packs/activate with only questions)
  app.post('/api/question-sets/:name/activate', async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid set name' });
    const qPath = path.join(_questionsDir(name), 'questions.json');
    if (!(await exists(qPath))) return res.status(404).json({ error: 'Set not found' });
    try {
      const active = await _readActivePacks();
      active.questions = name;
      await _writeActivePacks(active);
      resetQuestionIndex();
      getIo().emit('questionIndex', { index: 0 });
      getIo().emit('questionsUpdated');
      getIo().emit('activePacksChanged', active);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Get questions from a pack
  app.get('/api/question-sets/:name/questions', async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid set name' });
    const p = path.join(_questionsDir(name), 'questions.json');
    try { res.json(JSON.parse(await fsp.readFile(p, 'utf8'))); }
    catch { res.json([]); }
  });

  // Save questions to a pack
  app.post('/api/question-sets/:name/questions', async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid set name' });
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array' });
    try {
      const qDir = _questionsDir(name);
      await fsp.mkdir(qDir, { recursive: true });
      await fsp.writeFile(path.join(qDir, 'questions.json'), JSON.stringify(req.body, null, 2), 'utf8');
      // Ensure pack.json exists
      const packJson = path.join(_packDir(name), 'pack.json');
      if (!(await exists(packJson))) {
        await fsp.writeFile(packJson, JSON.stringify({ name, description: '', version: '1.0' }, null, 2), 'utf8');
      }
      const active = await _readActivePacks();
      if (active.questions === name) getIo().emit('questionsUpdated');
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Delete a pack (same as /api/packs/:name DELETE)
  app.delete('/api/question-sets/:name', async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid set name' });
    const dir = _packDir(name);
    if (!(await exists(dir))) return res.status(404).json({ error: 'Not found' });
    try {
      await fsp.rm(dir, { recursive: true, force: true });
      const active = await _readActivePacks();
      let changed = false;
      if (active.avatars === name) { active.avatars = 'default'; changed = true; }
      if (active.questions === name) { active.questions = 'default'; changed = true; }
      if (changed) await _writeActivePacks(active);
      getIo().emit('packsUpdated');
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Export pack as ZIP (alias — redirects to pack export with optional ?select=)
  app.get('/api/question-sets/:name/export', async (req, res) => {
    const qs = req.query.select ? `?select=${req.query.select}` : '';
    res.redirect(`/api/packs/${encodeURIComponent(req.params.name)}/export${qs}`);
  });

  // Import ZIP as pack (alias for /api/packs/:name/import)
  app.post('/api/question-sets/:name/import-zip', express.json({ limit: '256mb' }), async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid pack name' });
    const { data, selected } = req.body ?? {};
    if (typeof data !== 'string') return res.status(400).json({ error: 'Missing data field' });
    try {
      const dir = _packDir(name);
      await fsp.mkdir(dir, { recursive: true });
      const zip = new AdmZip(Buffer.from(data, 'base64'));
      const safePattern = /^(pack\.json|settings\.json|mappings\.json|avatars\/[^/]+|videos\/[^/]+|questions\/questions\.json|questions\/audio\/[^/]+\.mp3|questions\/images\/[^/]+|questions\/videos\/[^/]+)$/i;
      for (const entry of zip.getEntries()) {
        const entryName = entry.entryName.replace(/\\/g, '/');
        if (entry.isDirectory) continue;
        if (!safePattern.test(entryName)) continue;
        if (Array.isArray(selected)) {
          if (entryName.startsWith('avatars/') && !selected.includes('avatars')) continue;
          if (entryName.startsWith('videos/') && !selected.includes('videos')) continue;
          if (entryName.startsWith('questions/') && !selected.includes('questions')) continue;
        }
        const dest = path.join(dir, entryName);
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.writeFile(dest, entry.getData());
      }
      if (!(await exists(path.join(dir, 'pack.json')))) {
        await fsp.writeFile(path.join(dir, 'pack.json'), JSON.stringify({
          name, description: '', version: '1.0', includes: await _deriveIncludes(name)
        }, null, 2), 'utf8');
      }
      getIo().emit('packsUpdated');
      getIo().emit('questionsUpdated');
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Upload image to a pack's questions/images folder
  app.post('/api/question-sets/:name/upload-image', async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid set name' });
    const { filename, data, mimeType } = req.body ?? {};
    if (typeof filename !== 'string' || typeof data !== 'string')
      return res.status(400).json({ error: 'Invalid payload' });
    if (mimeType && !ALLOWED_MIME.has(mimeType))
      return res.status(400).json({ error: 'File type not allowed' });
    const safe = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
    if (!safe) return res.status(400).json({ error: 'Invalid filename' });
    try {
      const imgDir = path.join(_questionsDir(name), 'images');
      await fsp.mkdir(imgDir, { recursive: true });
      const dest = path.join(imgDir, `${Date.now()}_${safe}`);
      await fsp.writeFile(dest, Buffer.from(data, 'base64'));
      res.json({ ok: true, url: `/uploads/packs/${name}/questions/images/${path.basename(dest)}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  //  AVATAR API (operates on the avatars subfolder of the active avatar pack)
  // ═══════════════════════════════════════════════════════════════════════════════

  // Upload avatar image to the active avatar pack
  app.post('/api/upload-avatar', async (req, res) => {
    const { filename, data, mimeType } = req.body ?? {};
    if (typeof filename !== 'string' || typeof data !== 'string')
      return res.status(400).json({ error: 'Invalid payload' });
    if (mimeType && !ALLOWED_MIME.has(mimeType))
      return res.status(400).json({ error: 'File type not allowed' });
    try {
      const safe = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
      if (!safe) return res.status(400).json({ error: 'Invalid filename' });
      const active = await _readActivePacks();
      const avatarDir = _avatarsDir(active.avatars);
      await fsp.mkdir(avatarDir, { recursive: true });
      const destName = `${Date.now()}_${safe}`;
      const dest = path.join(avatarDir, destName);
      await fsp.writeFile(dest, Buffer.from(data, 'base64'));
      res.json({ ok: true, url: `/uploads/packs/${active.avatars}/avatars/${destName}`, filename: destName });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // List avatar images from the active avatar pack
  app.get('/api/avatars', async (_req, res) => {
    try {
      const active = await _readActivePacks();
      const packName = active.avatars;
      if (!packName || packName === 'none') return res.json({ files: [], urlPrefix: '' });
      const avatarDir = _avatarsDir(packName);
      if (!(await exists(avatarDir))) return res.json({ files: [], urlPrefix: '' });
      const entries = await fsp.readdir(avatarDir);
      const fileChecks = await Promise.all(entries.map(async (f) => {
        const stat = await fsp.stat(path.join(avatarDir, f));
        return stat.isFile() ? f : null;
      }));
      const files = fileChecks.filter(Boolean).sort().reverse();
      const prefix = `${_packUrlPrefix(packName)}/${packName}/avatars`;
      res.json({ files, urlPrefix: prefix });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Delete an avatar image from the active avatar pack
  app.delete('/api/avatars/:filename', async (req, res) => {
    try {
      const raw = req.params.filename || '';
      const safe = path.basename(raw).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
      if (!safe) return res.status(400).json({ error: 'Invalid filename' });
      const active = await _readActivePacks();
      const avatarDir = _avatarsDir(active.avatars);
      const target = path.join(avatarDir, safe);
      if (!(await exists(target))) return res.status(404).json({ error: 'Not found' });
      await fsp.unlink(target);
      try { getIo().emit('avatarsUpdated'); } catch (e) { /* ignore */ }
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // List packs that have avatars
  app.get('/api/avatar-packs', async (_req, res) => {
    try {
      const active = await _readActivePacks();
      res.json({ packs: await _packsWithContent('avatars'), active: active.avatars });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Activate avatar pack (empty name = none)
  app.post('/api/avatar-packs/:name/activate', async (req, res) => {
    const name = req.params.name;
    const isNone = name === '' || name === 'none';
    if (!isNone && !_safeName(name)) return res.status(400).json({ error: 'Invalid pack name' });
    try {
      const active = await _readActivePacks();
      active.avatars = isNone ? '' : name;
      await _writeActivePacks(active);
      getIo().emit('activePacksChanged', active);
      getIo().emit('avatarsUpdated');
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  //  AUDIO (loops) for a pack's questions
  // ═══════════════════════════════════════════════════════════════════════════════

  app.get('/api/question-sets/:name/loops', async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid set name' });
    const audioDir = path.join(_questionsDir(name), 'audio');
    if (!(await exists(audioDir))) return res.json([]);
    try {
      const files = await fsp.readdir(audioDir);
      const loops = files
        .map(f => { const m = f.match(/^loop(\d+)\.mp3$/i); return m ? parseInt(m[1], 10) : null; })
        .filter(n => n !== null).sort((a, b) => a - b);
      res.json(loops);
    } catch { res.json([]); }
  });

  app.post('/api/question-sets/:name/upload-audio', async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid set name' });
    const { filename, data } = req.body ?? {};
    if (typeof filename !== 'string' || typeof data !== 'string')
      return res.status(400).json({ error: 'Invalid payload' });
    if (!filename.toLowerCase().endsWith('.mp3'))
      return res.status(400).json({ error: 'Only .mp3 files allowed' });
    try {
      const audioDir = path.join(_questionsDir(name), 'audio');
      await fsp.mkdir(audioDir, { recursive: true });
      const existingFiles = await fsp.readdir(audioDir);
      const existing = existingFiles
        .map(f => { const m = f.match(/^loop(\d+)\.mp3$/i); return m ? parseInt(m[1], 10) : null; })
        .filter(n => n !== null);
      const nextN = existing.length > 0 ? Math.max(...existing) + 1 : 1;
      await fsp.writeFile(path.join(audioDir, `loop${nextN}.mp3`), Buffer.from(data, 'base64'));
      const updatedFiles = await fsp.readdir(audioDir);
      const loops = updatedFiles
        .map(f => { const m = f.match(/^loop(\d+)\.mp3$/i); return m ? parseInt(m[1], 10) : null; })
        .filter(n => n !== null).sort((a, b) => a - b);
      res.json({ ok: true, n: nextN, loops });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/question-sets/:name/loops/:n', async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid set name' });
    const n = parseInt(req.params.n, 10);
    if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: 'Invalid loop number' });
    const filepath = path.join(_questionsDir(name), 'audio', `loop${n}.mp3`);
    if (!(await exists(filepath))) return res.status(404).json({ error: 'Not found' });
    try {
      await fsp.unlink(filepath);
      const files = await fsp.readdir(path.join(_questionsDir(name), 'audio'));
      const loops = files
        .map(f => { const m = f.match(/^loop(\d+)\.mp3$/i); return m ? parseInt(m[1], 10) : null; })
        .filter(n => n !== null).sort((a, b) => a - b);
      res.json({ ok: true, loops });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  //  VIDEO files (question-specific + pack-level merged)
  // ═══════════════════════════════════════════════════════════════════════════════

  // Question-specific videos for a pack
  app.get('/api/question-sets/:name/videos', async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid set name' });
    const videoDir = path.join(_questionsDir(name), 'videos');
    if (!(await exists(videoDir))) return res.json([]);
    try {
      const entries = await fsp.readdir(videoDir);
      const fileChecks = await Promise.all(entries.map(async (f) => {
        const stat = await fsp.stat(path.join(videoDir, f));
        return stat.isFile() ? f : null;
      }));
      const files = fileChecks.filter(Boolean).sort();
      res.json(files);
    } catch { res.json([]); }
  });

  app.post('/api/question-sets/:name/upload-video', express.json({ limit: '256mb' }), async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid set name' });
    const { filename, data, mimeType } = req.body ?? {};
    if (typeof filename !== 'string' || typeof data !== 'string')
      return res.status(400).json({ error: 'Invalid payload' });
    if (mimeType && !ALLOWED_VIDEO_MIME.has(mimeType))
      return res.status(400).json({ error: 'File type not allowed — use mp4, webm, or ogg' });
    const safe = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
    if (!safe) return res.status(400).json({ error: 'Invalid filename' });
    try {
      const videoDir = path.join(_questionsDir(name), 'videos');
      await fsp.mkdir(videoDir, { recursive: true });
      const destName = `${Date.now()}_${safe}`;
      const dest = path.join(videoDir, destName);
      await fsp.writeFile(dest, Buffer.from(data, 'base64'));
      const entries = await fsp.readdir(videoDir);
      const fileChecks = await Promise.all(entries.map(async (f) => {
        const stat = await fsp.stat(path.join(videoDir, f));
        return stat.isFile() ? f : null;
      }));
      const files = fileChecks.filter(Boolean).sort();
      res.json({ ok: true, url: `/uploads/packs/${encodeURIComponent(name)}/questions/videos/${destName}`, videos: files });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/question-sets/:name/videos/:filename', async (req, res) => {
    const name = req.params.name;
    if (!_safeName(name)) return res.status(400).json({ error: 'Invalid set name' });
    const raw = req.params.filename || '';
    const safe = path.basename(raw).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
    if (!safe) return res.status(400).json({ error: 'Invalid filename' });
    const filepath = path.join(_questionsDir(name), 'videos', safe);
    if (!(await exists(filepath))) return res.status(404).json({ error: 'Not found' });
    try {
      await fsp.unlink(filepath);
      const videoDir = path.join(_questionsDir(name), 'videos');
      const entries = await fsp.readdir(videoDir);
      const fileChecks = await Promise.all(entries.map(async (f) => {
        const stat = await fsp.stat(path.join(videoDir, f));
        return stat.isFile() ? f : null;
      }));
      const files = fileChecks.filter(Boolean).sort();
      res.json({ ok: true, videos: files });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Merged video list: pack-level videos from avatar pack + question-specific videos from question pack
  app.get('/api/videos', async (_req, res) => {
    try {
      const active = await _readActivePacks();
      const result = [];
      // Pack-level videos from avatar pack
      const avatarVidDir = _videosDir(active.avatars);
      if (await exists(avatarVidDir)) {
        const entries = await fsp.readdir(avatarVidDir);
        const fileChecks = await Promise.all(entries.map(async (f) => {
          const stat = await fsp.stat(path.join(avatarVidDir, f));
          return stat.isFile() ? f : null;
        }));
        const avatarPrefix = `${_packUrlPrefix(active.avatars)}/${active.avatars}/videos`;
        fileChecks.filter(Boolean).sort()
          .forEach(f => result.push({ file: f, source: 'avatar', pack: active.avatars, urlPrefix: avatarPrefix }));
      }
      // Question-specific videos from question pack
      const questionVidDir = path.join(_questionsDir(active.questions), 'videos');
      if (await exists(questionVidDir)) {
        const entries = await fsp.readdir(questionVidDir);
        const fileChecks = await Promise.all(entries.map(async (f) => {
          const stat = await fsp.stat(path.join(questionVidDir, f));
          return stat.isFile() ? f : null;
        }));
        const qPrefix = `${_packUrlPrefix(active.questions)}/${active.questions}/questions/videos`;
        fileChecks.filter(Boolean).sort()
          .forEach(f => result.push({ file: f, source: 'question', pack: active.questions, urlPrefix: qPrefix }));
      }
      res.json(result);
    } catch { res.json([]); }
  });

  // ─── Loop Names API ───────────────────────────────────────────────────────────
  app.get('/api/loop-names', async (_req, res) => {
    try { res.json(JSON.parse(await fsp.readFile(LOOP_NAMES_PATH, 'utf8'))); }
    catch { res.json({}); }
  });
  app.post('/api/loop-names', async (req, res) => {
    const body = req.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body))
      return res.status(400).json({ error: 'Expected object' });
    await fsp.writeFile(LOOP_NAMES_PATH, JSON.stringify(body, null, 2), 'utf8');
    getIo().emit('loopNamesUpdated', body);
    res.json({ ok: true });
  });

  // ─── Results API ─────────────────────────────────────────────────────────────
  app.get('/api/results', async (_req, res) => {
    try {
      if (!(await exists(RESULTS_DIR))) return res.json([]);
      const entries = await fsp.readdir(RESULTS_DIR);
      const fileResults = await Promise.all(
        entries
          .filter(f => f.endsWith('.json'))
          .sort()
          .reverse()
          .map(async (f) => {
            const stat = await fsp.stat(path.join(RESULTS_DIR, f));
            return { filename: f, sizeBytes: stat.size, mtime: stat.mtime.toISOString() };
          })
      );
      res.json(fileResults);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.get('/api/results/:filename', async (req, res) => {
    const filename = path.basename(req.params.filename);
    if (!filename.endsWith('.json') || filename.includes('..')) return res.status(400).json({ error: 'Invalid filename' });
    const filepath = path.join(RESULTS_DIR, filename);
    if (!(await exists(filepath))) return res.status(404).json({ error: 'Not found' });
    try { res.json(JSON.parse(await fsp.readFile(filepath, 'utf8'))); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── LedFX proxy ─────────────────────────────────────────────────────────────
  app.get('/api/ledfx/devices', async (_req, res) => {
    try {
      const r = await axios.get(`${LEDFX_URL}/api/devices`, { timeout: 2000 });
      const govee = Object.values(r.data?.devices ?? {})
        .filter(d => d.type === 'govee')
        .map(d => ({ id: d.id, name: d.config?.name ?? d.id }));
      res.json({ ok: true, devices: govee });
    } catch {
      res.json({ ok: false, devices: [] });
    }
  });

  // ─── SPA fallback ─────────────────────────────────────────────────────────────
  app.get('*', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));
}

module.exports = { registerRoutes };
