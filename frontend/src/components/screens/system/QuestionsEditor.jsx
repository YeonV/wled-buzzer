/**
 * QuestionsEditor — in-app editor for questions.json (REST API backend).
 *
 * Thin wrapper: manages state + data fetching, delegates UI to shared components.
 */
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../i18n';
import { useSessionStore } from '../../../store/sessionStore';
import { useQuizStore } from '../../../store/quizStore';
import { BACKEND_URL } from '../../../utils/viewMode';
import { fetchQuestions, fetchLoops, fetchLoopNames, fetchVideos } from '../../../services/api';
import { MODES, questionToRow, rowToQuestion, makeEmptyRow } from './editor/questionUtils';
import SetManager from './editor/SetManager';
import LoopManager from './editor/LoopManager';
import QuestionList from './editor/QuestionList';

export default function QuestionsEditor() {
  const backendUrl = BACKEND_URL;
  const availableLoops = useSessionStore(s => s.availableLoops);
  const onClose = () => {
    fetchQuestions().then(data => { if (data.length > 0) useQuizStore.setState({ questions: data }); }).catch(() => {});
    fetchLoops().then(nums => { if (Array.isArray(nums) && nums.length > 0) useSessionStore.setState({ availableLoops: nums }); }).catch(() => {});
    fetchLoopNames().then(names => { if (names && typeof names === 'object') useSessionStore.setState({ loopNames: names }); }).catch(() => {});
    fetchVideos().then(files => useSessionStore.setState({ availableVideos: files })).catch(() => {});
    useSessionStore.setState({ showQuestionsEditor: false });
  };
  const { t } = useI18n();
  const [rows,    setRows]    = useState([]);
  const [status,  setStatus]  = useState('');
  const [dirty,   setDirty]   = useState(false);
  const [openIdx, setOpenIdx] = useState(null);
  const importRef    = useRef(null);
  const importZipRef = useRef(null);

  // ─── Question sets state ──────────────────────────────────────────────
  const [questionSets,   setQuestionSets]   = useState([]);
  const [activeSet,      setActiveSet]      = useState(null);
  const [editingSet,     setEditingSet]     = useState('default');
  const [newSetName,     setNewSetName]     = useState('');

  // ─── Loop audio state ────────────────────────────────────────────────
  const [loops,          setLoops]          = useState(availableLoops);
  const [loopNames,      setLoopNames]      = useState({});
  const [loopNameDrafts, setLoopNameDrafts] = useState({});
  const [audioDragging,  setAudioDragging]  = useState(false);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioError,     setAudioError]     = useState(null);
  const nextLoopN = loops.length > 0 ? Math.max(...loops) + 1 : 1;

  // ─── Video library state ──────────────────────────────────────────────
  const [videos,         setVideos]         = useState([]);
  const [videoDragging,  setVideoDragging]  = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoError,     setVideoError]     = useState(null);
  const videoFileRef = useRef(null);

  // ─── Derived URL helpers ──────────────────────────────────────────────
  const setUrlBase     = `${backendUrl}/api/question-sets/${encodeURIComponent(editingSet)}`;
  const questionsUrl   = `${setUrlBase}/questions`;
  const uploadImageUrl = `${setUrlBase}/upload-image`;
  const loopsUrl       = `${setUrlBase}/loops`;
  const uploadAudioUrl = `${setUrlBase}/upload-audio`;
  const deleteLoopUrl  = (n) => `${setUrlBase}/loops/${n}`;
  const videosUrl      = `${setUrlBase}/videos`;
  const uploadVideoUrl = `${setUrlBase}/upload-video`;
  const deleteVideoUrl = (f) => `${setUrlBase}/videos/${encodeURIComponent(f)}`;

  // ─── Load sets list ───────────────────────────────────────────────────
  const reloadSets = () => {
    fetch(`${backendUrl}/api/question-sets`)
      .then(r => r.ok ? r.json() : { sets: [], active: null })
      .then(({ sets, active }) => { setQuestionSets(sets ?? []); setActiveSet(active ?? null); })
      .catch(() => {});
  };
  useEffect(() => { reloadSets(); }, [backendUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load questions for current editing context ───────────────────────
  useEffect(() => {
    setStatus('loading');
    fetch(questionsUrl)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => { setRows(Array.isArray(data) ? data.map(questionToRow) : []); setStatus(''); setDirty(false); })
      .catch(err => setStatus(`error:Could not load questions (${err})`));
  }, [questionsUrl]);

  // ─── Load loops for current editing context ───────────────────────────
  useEffect(() => {
    fetch(loopsUrl).then(r => r.ok ? r.json() : []).then(nums => { if (Array.isArray(nums) && nums.length > 0) setLoops(nums); else setLoops([]); }).catch(() => {});
    if (!editingSet) {
      fetch(`${backendUrl}/api/loop-names`).then(r => r.ok ? r.json() : {}).then(names => { if (names && typeof names === 'object') { setLoopNames(names); setLoopNameDrafts(names); } }).catch(() => {});
    } else { setLoopNames({}); setLoopNameDrafts({}); }
  }, [loopsUrl, editingSet, backendUrl]);

  // ─── Load videos for current editing context ──────────────────────────
  useEffect(() => {
    fetch(videosUrl).then(r => r.ok ? r.json() : []).then(files => setVideos(Array.isArray(files) ? files : [])).catch(() => setVideos([]));
  }, [videosUrl]);

  // ─── Row helpers ──────────────────────────────────────────────────────
  const update   = (idx, patch) => { setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r)); setDirty(true); };
  const moveUp   = (i) => { if (i === 0) return; setRows(p => { const a = [...p]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a; }); setDirty(true); setOpenIdx(i - 1); };
  const moveDown = (i) => { setRows(p => { if (i >= p.length - 1) return p; const a = [...p]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a; }); setDirty(true); setOpenIdx(i + 1); };
  const deleteRow = (i) => { setRows(p => p.filter((_, j) => j !== i)); setDirty(true); setOpenIdx(null); };
  const addRow = () => { setRows(prev => { const next = [...prev, makeEmptyRow()]; setOpenIdx(next.length - 1); return next; }); setDirty(true); };

  // ─── Save ─────────────────────────────────────────────────────────────
  const save = async () => {
    setStatus('saving');
    try {
      const res = await fetch(questionsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows.map(rowToQuestion)) });
      if (!res.ok) throw new Error(res.status);
      onClose();
    } catch (err) { setStatus(`error:Save failed (${err})`); }
  };

  // ─── Create / delete set ──────────────────────────────────────────────
  const createSet = async () => {
    const name = newSetName.trim(); if (!name) return;
    setStatus('saving');
    try {
      const res = await fetch(`${backendUrl}/api/question-sets/${encodeURIComponent(name)}/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([]) });
      if (!res.ok) throw new Error(res.status);
      setNewSetName(''); reloadSets(); setEditingSet(name); setStatus('');
    } catch (err) { setStatus(`error:Create failed (${err})`); }
  };
  const deleteSet = async (name) => {
    if (!window.confirm(t('qe_delete_set_confirm', name))) return;
    try { await fetch(`${backendUrl}/api/question-sets/${encodeURIComponent(name)}`, { method: 'DELETE' }); if (editingSet === name) setEditingSet('default'); reloadSets(); }
    catch (err) { setStatus(`error:Delete failed (${err})`); }
  };

  // ─── Export dialog ────────────────────────────────────────────────────
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportSelection, setExportSelection] = useState({ avatars: true, videos: true, questions: true });
  const openExportDialog = () => { setExportSelection({ avatars: true, videos: true, questions: true }); setShowExportDialog(true); };
  const doExport = () => {
    const selected = Object.entries(exportSelection).filter(([, v]) => v).map(([k]) => k);
    const qs = selected.length < 3 ? `?select=${selected.join(',')}` : '';
    const a = document.createElement('a'); a.href = `${backendUrl}/api/packs/${encodeURIComponent(editingSet)}/export${qs}`; a.download = `${editingSet}.zip`; a.click();
    setShowExportDialog(false);
  };

  // ─── Import ZIP ───────────────────────────────────────────────────────
  const importZip = async (e) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = '';
    setStatus('saving');
    try {
      const data = await new Promise((res, rej) => { const reader = new FileReader(); reader.onload = ev => res(ev.target.result.split(',')[1]); reader.onerror = rej; reader.readAsDataURL(file); });
      const resp = await fetch(`${backendUrl}/api/question-sets/${encodeURIComponent(editingSet)}/import-zip`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const [qResp, lResp] = await Promise.all([fetch(questionsUrl), fetch(loopsUrl)]);
      const [qData, lData] = await Promise.all([qResp.json(), lResp.json()]);
      setRows(Array.isArray(qData) ? qData.map(questionToRow) : []);
      setLoops(Array.isArray(lData) ? lData : []);
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
    try {
      const dataUrl = await new Promise((res, rej) => { const reader = new FileReader(); reader.onload = e => res(e.target.result); reader.onerror = rej; reader.readAsDataURL(file); });
      const resp = await fetch(uploadAudioUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, data: dataUrl.split(',')[1] }) });
      if (!resp.ok) throw new Error(`Upload failed (${resp.status})`);
      const { loops: newLoops } = await resp.json(); setLoops(newLoops);
    } catch (err) { setAudioError(err.message); } finally { setAudioUploading(false); }
  };
  const deleteLoop = async (n) => {
    try { const resp = await fetch(deleteLoopUrl(n), { method: 'DELETE' }); if (!resp.ok) throw new Error(`Delete failed (${resp.status})`); const { loops: newLoops } = await resp.json(); setLoops(newLoops); }
    catch (err) { setAudioError(err.message); }
  };
  const handleAudioDrop = (e) => { e.preventDefault(); setAudioDragging(false); const file = e.dataTransfer.files?.[0]; if (file && (file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3'))) uploadLoop(file); else setAudioError(t('qe_only_mp3_err')); };
  const saveLoopName = async (n) => {
    const name = (loopNameDrafts[n] ?? '').trim(); const updated = { ...loopNames }; if (name) updated[n] = name; else delete updated[n]; setLoopNames(updated);
    try { await fetch(`${backendUrl}/api/loop-names`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) }); } catch { /* non-critical */ }
  };

  // ─── Video handlers ───────────────────────────────────────────────────
  const uploadVideo = async (file) => {
    setVideoError(null); setVideoUploading(true);
    try {
      const dataUrl = await new Promise((res, rej) => { const reader = new FileReader(); reader.onload = e => res(e.target.result); reader.onerror = rej; reader.readAsDataURL(file); });
      const resp = await fetch(uploadVideoUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, data: dataUrl.split(',')[1], mimeType: file.type }) });
      if (!resp.ok) throw new Error(`Upload failed (${resp.status})`); const { videos: newVideos } = await resp.json(); setVideos(newVideos);
    } catch (err) { setVideoError(err.message); } finally { setVideoUploading(false); }
  };
  const deleteVideo = async (filename) => {
    try { const resp = await fetch(deleteVideoUrl(filename), { method: 'DELETE' }); if (!resp.ok) throw new Error(`Delete failed (${resp.status})`); const { videos: newVideos } = await resp.json(); setVideos(newVideos); }
    catch (err) { setVideoError(err.message); }
  };
  const handleVideoDrop = (e) => { e.preventDefault(); setVideoDragging(false); const file = e.dataTransfer.files?.[0]; if (file && (file.type.startsWith('video/') || /\.(mp4|webm|ogg)$/i.test(file.name))) uploadVideo(file); else setVideoError(t('qe_only_video_err')); };

  // ─── Image upload callback for shared components ──────────────────────
  const handleUploadImage = async (file) => {
    const dataUrl = await new Promise((res, rej) => { const reader = new FileReader(); reader.onload = e => res(e.target.result); reader.onerror = rej; reader.readAsDataURL(file); });
    const base64 = dataUrl.split(',')[1];
    const resp = await fetch(uploadImageUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, data: base64, mimeType: file.type }) });
    if (!resp.ok) throw new Error(`Upload failed (${resp.status})`);
    const { url } = await resp.json();
    return url;
  };

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="qe-overlay">
      <div className="qe-panel">
        <div className="qe-header">
          <h2 className="qe-title">{t('qe_title')}</h2>
          <button className="qe-close" onClick={onClose} title="Close without saving">{'\u2715'}</button>
        </div>

        {errorMsg && <div className="qe-error">{errorMsg}</div>}

        <SetManager
          questionSets={questionSets} editingSet={editingSet} activeSet={activeSet}
          onSelectSet={setEditingSet} newSetName={newSetName}
          onNewSetNameChange={setNewSetName} onCreateSet={createSet} onDeleteSet={deleteSet} t={t}
        />

        <LoopManager
          loops={loops} loopNames={loopNames} loopNameDrafts={loopNameDrafts}
          onLoopNameChange={(n, v) => setLoopNameDrafts(prev => ({ ...prev, [n]: v }))}
          onSaveLoopName={saveLoopName} onDeleteLoop={deleteLoop} onUploadAudio={uploadLoop}
          audioUploading={audioUploading} audioError={audioError} audioDragging={audioDragging}
          onAudioDragOver={e => { e.preventDefault(); setAudioDragging(true); }}
          onAudioDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setAudioDragging(false); }}
          onAudioDrop={handleAudioDrop}
          getLoopUrl={n => `/uploads/packs/${encodeURIComponent(editingSet)}/questions/audio/loop${n}.mp3`}
          nextLoopN={nextLoopN} editingSet={editingSet} t={t}
        />

        {/* ── Video Manager (backend-only) ── */}
        <div className="qe-audio-section">
          <div className="qe-audio-header">{t('qe_videos_title')}{editingSet ? ` \u2014 ${editingSet}` : ''}</div>
          <div className="qe-audio-list">
            {videos.length === 0 && <div className="qe-audio-empty">{t('qe_videos_empty')}</div>}
            {videos.map(f => (
              <div key={f} className="qe-audio-item">
                <span className="qe-audio-label qe-audio-label--ellipsis">{f}</span>
                <video src={`/uploads/packs/${encodeURIComponent(editingSet)}/questions/videos/${encodeURIComponent(f)}`} className="qe-video-thumb" controls preload="metadata" />
                <button className="qe-icon-btn qe-delete" onClick={() => deleteVideo(f)} title={`Delete ${f}`}>{'\uD83D\uDDD1'}</button>
              </div>
            ))}
          </div>
          <div
            className={`qe-audio-drop${videoDragging ? ' qe-audio-drop--over' : ''}`}
            onDragOver={e => { e.preventDefault(); setVideoDragging(true); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setVideoDragging(false); }}
            onDrop={handleVideoDrop}
            onClick={() => videoFileRef.current?.click()}
          >
            {videoUploading ? t('qe_uploading') : t('qe_drop_video')}
            <input ref={videoFileRef} type="file" accept="video/mp4,video/webm,video/ogg,.mp4,.webm,.ogg" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadVideo(f); e.target.value = ''; }} />
          </div>
          {videoError && <div className="qe-img-error">{videoError}</div>}
        </div>

        {isLoading ? (
          <div className="qe-loading">{t('qe_loading')}</div>
        ) : (
          <QuestionList
            rows={rows} openIdx={openIdx}
            onToggle={idx => setOpenIdx(openIdx === idx ? null : idx)}
            onUpdate={update} onMoveUp={moveUp} onMoveDown={moveDown} onDelete={deleteRow} onAdd={addRow}
            loops={loops} loopNames={loopNames} videos={videos}
            onUploadImage={handleUploadImage}
            editingSet={editingSet} modes={MODES} t={t}
          />
        )}

        {/* ── Footer ── */}
        <div className="qe-footer">
          <div className="qe-footer-left">
            <button className="qe-btn qe-btn-secondary" onClick={openExportDialog}  disabled={isLoading} title="Export pack as ZIP">{t('qe_export_zip')}</button>
            <button className="qe-btn qe-btn-secondary" onClick={() => importZipRef.current?.click()} disabled={isLoading} title="Import a previously exported ZIP">{t('qe_import_zip')}</button>
            <input ref={importZipRef} type="file" accept=".zip,application/zip" style={{ display: 'none' }} onChange={importZip} />
            <button className="qe-btn qe-btn-secondary" onClick={exportJSON}  disabled={isLoading} title="Export questions only as JSON">{t('qe_export_json')}</button>
            <button className="qe-btn qe-btn-secondary" onClick={() => importRef.current?.click()} disabled={isLoading} title="Import questions-only JSON">{t('qe_import_json')}</button>
            <input ref={importRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={importJSON} />
          </div>
          <div className="qe-footer-right">
            <button className="btn btn--ghost" onClick={onClose} disabled={isSaving}>{t('cancel')}</button>
            <button className="btn btn--success" onClick={save} disabled={isLoading || isSaving || !dirty}>
              {isSaving ? t('qe_saving') : t('qe_save')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Export Dialog ── */}
      {showExportDialog && (
        <div className="qe-overlay" onClick={() => setShowExportDialog(false)}>
          <div className="qe-dialog" onClick={e => e.stopPropagation()}>
            <h3>{t('qe_export_zip')}: {editingSet}</h3>
            <p style={{ opacity: 0.7, margin: '0.5rem 0 1rem' }}>Select content to include:</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input type="checkbox" checked={exportSelection.questions} onChange={e => setExportSelection(s => ({ ...s, questions: e.target.checked }))} />
              Questions
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input type="checkbox" checked={exportSelection.avatars} onChange={e => setExportSelection(s => ({ ...s, avatars: e.target.checked }))} />
              Avatars
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input type="checkbox" checked={exportSelection.videos} onChange={e => setExportSelection(s => ({ ...s, videos: e.target.checked }))} />
              Videos
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn btn--ghost" onClick={() => setShowExportDialog(false)}>Cancel</button>
              <button className="btn btn--accent" onClick={doExport} disabled={!exportSelection.questions && !exportSelection.avatars && !exportSelection.videos}>Export</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
