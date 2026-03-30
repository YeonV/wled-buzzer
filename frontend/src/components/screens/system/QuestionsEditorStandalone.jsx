/**
 * QuestionsEditorStandalone — browser-only editor for questions.json (IndexedDB).
 *
 * Thin wrapper: manages state + IndexedDB persistence, delegates UI to shared components.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import JSZip from 'jszip';
import { useI18n } from '../../../i18n';
import {
  ensureBuiltIn, listSets, loadSet, saveSet, deleteSet as idbDeleteSet,
  saveImage, getImageUrl, getImageRecord,
  saveImageBlob, saveAudioBlob,
  saveAudio, getAudioUrl, getAudioRecord, listLoops as idbListLoops, deleteLoop as idbDeleteLoop,
  revokeAll,
} from '../../../utils/standaloneStorage';
import { MODES_NO_VIDEO, questionToRow, rowToQuestion, makeEmptyRow } from './editor/questionUtils';
import SetManager from './editor/SetManager';
import LoopManager from './editor/LoopManager';
import QuestionList from './editor/QuestionList';

// ─── Synchronous resolve wrapper for ImageInput ─────────────────────────────
// ImageInput needs a synchronous resolveUrl function. For idb:// paths we cache
// resolved object URLs and trigger async resolution in the background.
const resolvedCache = new Map();

function useSyncResolver() {
  const [, forceUpdate] = useState(0);

  const resolveUrl = useCallback((path) => {
    if (!path) return '';
    if (!path.startsWith('idb://')) return path;
    const cached = resolvedCache.get(path);
    if (cached) return cached;
    // Trigger async resolution
    if (path.startsWith('idb://images/')) {
      getImageUrl(path).then(u => {
        if (u) { resolvedCache.set(path, u); forceUpdate(n => n + 1); }
      });
    }
    return ''; // Return empty while resolving
  }, []);

  return resolveUrl;
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function QuestionsEditorStandalone() {
  const { t } = useI18n();
  const [rows,    setRows]    = useState([]);
  const [status,  setStatus]  = useState('');
  const [dirty,   setDirty]   = useState(false);
  const [openIdx, setOpenIdx] = useState(null);
  const importRef    = useRef(null);
  const importZipRef = useRef(null);

  // ─── Question sets state ──────────────────────────────────────────────
  const [questionSets,   setQuestionSets]   = useState([]);
  const [editingSet,     setEditingSet]     = useState('built-in');
  const [newSetName,     setNewSetName]     = useState('');

  // ─── Loop audio state ────────────────────────────────────────────────
  const [loops,          setLoops]          = useState([]);
  const [loopNames,      setLoopNames]      = useState({});
  const [loopNameDrafts, setLoopNameDrafts] = useState({});
  const [loopAudioUrls,  setLoopAudioUrls]  = useState({});
  const [audioDragging,  setAudioDragging]  = useState(false);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioError,     setAudioError]     = useState(null);
  const nextLoopN = loops.length > 0 ? Math.max(...loops) + 1 : 1;

  const resolveUrl = useSyncResolver();

  // ─── Load sets list ───────────────────────────────────────────────────
  const reloadSets = useCallback(async () => {
    await ensureBuiltIn();
    const sets = await listSets();
    setQuestionSets(sets);
  }, []);
  useEffect(() => { reloadSets(); }, [reloadSets]);

  // ─── Load questions for current editing set ───────────────────────────
  useEffect(() => {
    setStatus('loading');
    loadSet(editingSet)
      .then(({ questions, loopNames: names }) => {
        setRows(Array.isArray(questions) ? questions.map(questionToRow) : []);
        setLoopNames(names ?? {}); setLoopNameDrafts(names ?? {});
        setStatus(''); setDirty(false);
      })
      .catch(err => setStatus(`error:Could not load questions (${err})`));
  }, [editingSet]);

  // ─── Load loops for current editing set ───────────────────────────────
  const reloadLoops = useCallback(async () => {
    const nums = await idbListLoops(editingSet);
    setLoops(nums);
    const urls = {};
    for (const n of nums) { urls[n] = await getAudioUrl(editingSet, n); }
    setLoopAudioUrls(urls);
  }, [editingSet]);
  useEffect(() => { reloadLoops(); }, [reloadLoops]);

  // ─── Cleanup object URLs on unmount ───────────────────────────────────
  useEffect(() => () => revokeAll(), []);

  // ─── Row helpers ──────────────────────────────────────────────────────
  const update   = (idx, patch) => { setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r)); setDirty(true); };
  const moveUp   = (i) => { if (i === 0) return; setRows(p => { const a = [...p]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a; }); setDirty(true); setOpenIdx(i - 1); };
  const moveDown = (i) => { setRows(p => { if (i >= p.length - 1) return p; const a = [...p]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a; }); setDirty(true); setOpenIdx(i + 1); };
  const deleteRow = (i) => { setRows(p => p.filter((_, j) => j !== i)); setDirty(true); setOpenIdx(null); };
  const addRow = () => { setRows(prev => { const next = [...prev, makeEmptyRow()]; setOpenIdx(next.length - 1); return next; }); setDirty(true); };

  // ─── Save ─────────────────────────────────────────────────────────────
  const save = async () => {
    setStatus('saving');
    try { await saveSet(editingSet, rows.map(rowToQuestion), loopNames); setDirty(false); setStatus(''); }
    catch (err) { setStatus(`error:Save failed (${err})`); }
  };

  // ─── Create / delete set ──────────────────────────────────────────────
  const createSet = async () => {
    const name = newSetName.trim(); if (!name) return;
    setStatus('saving');
    try { await saveSet(name, [], {}); setNewSetName(''); await reloadSets(); setEditingSet(name); setStatus(''); }
    catch (err) { setStatus(`error:Create failed (${err})`); }
  };
  const handleDeleteSet = async (name) => {
    if (!window.confirm(t('qe_delete_set_confirm', name))) return;
    try { await idbDeleteSet(name); if (editingSet === name) setEditingSet('default'); await reloadSets(); }
    catch (err) { setStatus(`error:Delete failed (${err})`); }
  };

  // ─── Export ZIP (client-side with JSZip) ──────────────────────────────
  const exportZip = async () => {
    setStatus('saving');
    try {
      const zip = new JSZip();
      const rewrite = (p) => { if (!p || !p.startsWith('idb://images/')) return p; return 'images/' + p.replace(/^idb:\/\/images\/[^/]+\//, ''); };
      const questions = rows.map(rowToQuestion).map(q => {
        const out = { ...q };
        if (out.questionImage) out.questionImage = rewrite(out.questionImage);
        if (out.answerImage)   out.answerImage   = rewrite(out.answerImage);
        if (Array.isArray(out.answers)) { out.answers = out.answers.map(a => { if (typeof a === 'object' && a.image) return { ...a, image: rewrite(a.image) }; return a; }); }
        return out;
      });
      zip.file('questions.json', JSON.stringify(questions, null, 2));
      const imageKeys = new Set();
      for (const row of rows) {
        if (row.questionImage?.startsWith('idb://')) imageKeys.add(row.questionImage);
        if (row.answerImage?.startsWith('idb://'))  imageKeys.add(row.answerImage);
        for (const ans of (row.answers || [])) { if (ans.image?.startsWith('idb://')) imageKeys.add(ans.image); }
      }
      for (const key of imageKeys) { const record = await getImageRecord(key); if (record) { const filename = key.replace(/^idb:\/\/images\/[^/]+\//, ''); zip.file(`images/${filename}`, record.blob); } }
      for (const n of loops) { const record = await getAudioRecord(editingSet, n); if (record) zip.file(`audio/loop${n}.mp3`, record.blob); }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${editingSet}.zip`; a.click(); URL.revokeObjectURL(a.href);
      setStatus('');
    } catch (err) { setStatus(`error:Export failed (${err.message})`); }
  };

  // ─── Import ZIP (client-side with JSZip) ──────────────────────────────
  const importZip = async (e) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = '';
    setStatus('saving');
    try {
      const zip = await JSZip.loadAsync(file);
      const qFile = zip.file('questions.json'); if (!qFile) throw new Error('No questions.json in ZIP');
      const qData = JSON.parse(await qFile.async('string'));
      const imageMap = {};
      for (const [path, entry] of Object.entries(zip.files)) {
        if (!path.startsWith('images/') || entry.dir) continue;
        const blob = await entry.async('blob'); const filename = path.replace(/^images\//, '');
        const key = await saveImageBlob(editingSet, filename, blob); imageMap[path] = key; imageMap[filename] = key;
      }
      for (const [path, entry] of Object.entries(zip.files)) {
        if (!path.startsWith('audio/') || entry.dir) continue;
        const match = path.match(/loop(\d+)\.mp3$/i); if (!match) continue;
        const blob = await entry.async('blob'); await saveAudioBlob(editingSet, Number(match[1]), blob);
      }
      const rewrittenQuestions = qData.map(q => {
        const rw = (p) => { if (!p) return p; return imageMap[p] || imageMap[p.replace(/^.*\//, '')] || p; };
        const out = { ...q };
        if (out.questionImage) out.questionImage = rw(out.questionImage);
        if (out.answerImage)   out.answerImage   = rw(out.answerImage);
        if (Array.isArray(out.answers)) { out.answers = out.answers.map(a => { if (typeof a === 'object' && a.image) return { ...a, image: rw(a.image) }; return a; }); }
        return out;
      });
      await saveSet(editingSet, rewrittenQuestions, loopNames);
      setRows(rewrittenQuestions.map(questionToRow)); await reloadLoops();
      setDirty(false); setStatus('');
    } catch (err) { setStatus(`error:ZIP import failed \u2014 ${err.message}`); }
  };

  // ─── Export / import JSON ─────────────────────────────────────────────
  const exportJSON = () => { const blob = new Blob([JSON.stringify(rows.map(rowToQuestion), null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'questions.json'; a.click(); URL.revokeObjectURL(a.href); };
  const importJSON = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { try { const data = JSON.parse(ev.target.result); if (!Array.isArray(data)) throw new Error('Not an array'); setRows(data.map(questionToRow)); setDirty(true); setStatus(''); } catch (err) { setStatus(`error:Import failed \u2014 invalid JSON (${err.message})`); } };
    reader.readAsText(file); e.target.value = '';
  };

  const isLoading = status === 'loading';
  const isSaving  = status === 'saving';
  const errorMsg  = status.startsWith('error:') ? status.slice(6) : null;

  // ─── Loop audio handlers ──────────────────────────────────────────────
  const uploadLoop = async (file) => {
    setAudioError(null); setAudioUploading(true);
    try { await saveAudio(editingSet, nextLoopN, file); await reloadLoops(); }
    catch (err) { setAudioError(err.message); } finally { setAudioUploading(false); }
  };
  const handleDeleteLoop = async (n) => {
    try { await idbDeleteLoop(editingSet, n); await reloadLoops(); } catch (err) { setAudioError(err.message); }
  };
  const handleAudioDrop = (e) => { e.preventDefault(); setAudioDragging(false); const file = e.dataTransfer.files?.[0]; if (file && (file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3'))) uploadLoop(file); else setAudioError(t('qe_only_mp3_err')); };
  const saveLoopName = (n) => {
    const name = (loopNameDrafts[n] ?? '').trim(); const updated = { ...loopNames }; if (name) updated[n] = name; else delete updated[n]; setLoopNames(updated);
    loadSet(editingSet).then(({ questions }) => saveSet(editingSet, questions, updated)).catch(() => {});
  };

  // ─── Image upload callback for shared components ──────────────────────
  const handleUploadImage = async (file) => {
    return await saveImage(editingSet, file);
  };

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', padding: '1rem', boxSizing: 'border-box' }}>
      <div className="qe-panel" style={{ margin: '0 auto', position: 'relative' }}>
        <div className="qe-header">
          <h2 className="qe-title">{t('qe_title')}</h2>
        </div>

        {errorMsg && <div className="qe-error">{errorMsg}</div>}

        <SetManager
          questionSets={questionSets} editingSet={editingSet}
          onSelectSet={setEditingSet} newSetName={newSetName}
          onNewSetNameChange={setNewSetName} onCreateSet={createSet} onDeleteSet={handleDeleteSet} t={t}
        />

        <LoopManager
          loops={loops} loopNames={loopNames} loopNameDrafts={loopNameDrafts}
          onLoopNameChange={(n, v) => setLoopNameDrafts(prev => ({ ...prev, [n]: v }))}
          onSaveLoopName={saveLoopName} onDeleteLoop={handleDeleteLoop} onUploadAudio={uploadLoop}
          audioUploading={audioUploading} audioError={audioError} audioDragging={audioDragging}
          onAudioDragOver={e => { e.preventDefault(); setAudioDragging(true); }}
          onAudioDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setAudioDragging(false); }}
          onAudioDrop={handleAudioDrop}
          getLoopUrl={n => loopAudioUrls[n] || ''}
          nextLoopN={nextLoopN} editingSet={editingSet} t={t}
        />

        {isLoading ? (
          <div className="qe-loading">{t('qe_loading')}</div>
        ) : (
          <QuestionList
            rows={rows} openIdx={openIdx}
            onToggle={idx => setOpenIdx(openIdx === idx ? null : idx)}
            onUpdate={update} onMoveUp={moveUp} onMoveDown={moveDown} onDelete={deleteRow} onAdd={addRow}
            loops={loops} loopNames={loopNames} videos={[]}
            onUploadImage={handleUploadImage} resolveUrl={resolveUrl}
            editingSet={editingSet} modes={MODES_NO_VIDEO} t={t}
          />
        )}

        {/* ── Footer ── */}
        <div className="qe-footer">
          <div className="qe-footer-left">
            <button className="qe-btn qe-btn-secondary" onClick={exportZip}  disabled={isLoading || isSaving} title="Export questions, audio and images as a ZIP">{t('qe_export_zip')}</button>
            <button className="qe-btn qe-btn-secondary" onClick={() => importZipRef.current?.click()} disabled={isLoading} title="Import a previously exported ZIP">{t('qe_import_zip')}</button>
            <input ref={importZipRef} type="file" accept=".zip,application/zip" style={{ display: 'none' }} onChange={importZip} />
            <button className="qe-btn qe-btn-secondary" onClick={exportJSON}  disabled={isLoading} title="Export questions only as JSON">{t('qe_export_json')}</button>
            <button className="qe-btn qe-btn-secondary" onClick={() => importRef.current?.click()} disabled={isLoading} title="Import questions-only JSON">{t('qe_import_json')}</button>
            <input ref={importRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={importJSON} />
          </div>
          <div className="qe-footer-right">
            <button className="btn btn--success" onClick={save} disabled={isLoading || isSaving || !dirty}>
              {isSaving ? t('qe_saving') : t('qe_save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
