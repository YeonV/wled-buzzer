import { useState, useEffect, useRef } from 'react';
import { Package, Trash2, Download, Upload, X, Image, FileText, Film } from 'lucide-react';
import { useSessionStore } from '../store/sessionStore';
import { useQuizStore } from '../store/quizStore';
import { fetchPacks, deletePack, peekPack, importPack, createPack } from '../services/api';
import { BACKEND_URL } from '../utils/viewMode';

const CONTENT_ICONS = { avatars: Image, questions: FileText, videos: Film };

export default function PackManager({ onClose }) {
  const [packs, setPacks] = useState([]);
  const [active, setActive] = useState({});
  const [busy, setBusy] = useState(false);

  // Import state
  const [peekData, setPeekData] = useState(null); // { meta, contents, raw }
  const [importName, setImportName] = useState('');
  const [importSel, setImportSel] = useState({ avatars: true, videos: true, questions: true });
  const importRef = useRef(null);
  const [newPackName, setNewPackName] = useState('');

  // Export dialog state
  const [exportPack, setExportPack] = useState(null);
  const [exportSel, setExportSel] = useState({ avatars: true, videos: true, questions: true });

  const reload = () => fetchPacks(BACKEND_URL).then(d => {
    setPacks(d.packs ?? []);
    setActive(d.active ?? {});
    if (d.active?.avatars) useSessionStore.setState({ activeAvatarPack: d.active.avatars });
    if (d.active?.questions) useQuizStore.setState({ activeSet: d.active.questions });
  }).catch(() => {});

  useEffect(() => {
    reload();
    // Check if there's a pending import from global file drop
    const pending = useSessionStore.getState().pendingPackImport;
    if (pending) {
      const name = pending.meta?.name || pending.fileName?.replace(/\.zip$/i, '') || 'imported';
      setPeekData({ meta: pending.meta, contents: pending.contents, raw: pending.raw });
      setImportName(name);
      setImportSel({
        avatars: pending.contents.avatars > 0,
        videos: pending.contents.videos > 0,
        questions: pending.contents.questions > 0,
      });
      useSessionStore.setState({ pendingPackImport: null });
    }
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm(`Delete pack "${id}"?`)) return;
    setBusy(true);
    await deletePack(BACKEND_URL, id);
    await reload();
    setBusy(false);
  };

  const handleExport = (pack) => {
    setExportSel({ avatars: true, videos: true, questions: true });
    setExportPack(pack);
  };

  const doExport = () => {
    const selected = Object.entries(exportSel).filter(([, v]) => v).map(([k]) => k);
    const qs = selected.length < 3 ? `?select=${selected.join(',')}` : '';
    const a = document.createElement('a');
    a.href = `${BACKEND_URL}/api/packs/${encodeURIComponent(exportPack.id)}/export${qs}`;
    a.download = `${exportPack.id}.zip`;
    a.click();
    setExportPack(null);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setBusy(true);
    try {
      const raw = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = ev => res(ev.target.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const peek = await peekPack(BACKEND_URL, raw);
      if (!peek) throw new Error('Failed to peek');
      const name = peek.meta?.name || file.name.replace(/\.zip$/i, '');
      setPeekData({ ...peek, raw });
      setImportName(name);
      setImportSel({
        avatars: peek.contents.avatars > 0,
        videos: peek.contents.videos > 0,
        questions: peek.contents.questions > 0,
      });
    } catch (err) {
      console.error('Import peek failed:', err);
    }
    setBusy(false);
  };

  const doImport = async () => {
    if (!peekData || !importName.trim()) return;
    setBusy(true);
    const selected = Object.entries(importSel).filter(([, v]) => v).map(([k]) => k);
    await importPack(BACKEND_URL, importName.trim(), peekData.raw, selected);
    setPeekData(null);
    await reload();
    setBusy(false);
  };

  return (
    <div className="qe-overlay" onClick={onClose}>
      <div className="pack-manager" onClick={e => e.stopPropagation()}>
        <div className="pack-manager__header">
          <h2><Package size={20} /> Pack Manager</h2>
          <button className="btn btn--icon btn--ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="pack-manager__list">
          {packs.map(p => (
            <div key={p.id} className="pack-manager__item">
              <div className="pack-manager__info">
                <span className="pack-manager__name">{p.name || p.id}</span>
                <div className="pack-manager__badges">
                  {p.includes.map(type => {
                    const Icon = CONTENT_ICONS[type];
                    return <span key={type} className="pack-manager__badge" title={type}>{Icon && <Icon size={12} />} {type}</span>;
                  })}
                </div>
                {(active.avatars === p.id || active.questions === p.id) && (
                  <div className="pack-manager__active">
                    {active.avatars === p.id && <span className="pack-manager__active-tag">avatars</span>}
                    {active.questions === p.id && <span className="pack-manager__active-tag">questions</span>}
                  </div>
                )}
              </div>
              <div className="pack-manager__actions">
                <button className="btn btn--icon btn--ghost btn--small" onClick={() => handleExport(p)} title="Export"><Download size={14} /></button>
                <button className="btn btn--icon btn--ghost btn--small btn--hover--error" onClick={() => handleDelete(p.id)} disabled={busy} title="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {packs.length === 0 && <div style={{ opacity: 0.5, padding: '1rem', textAlign: 'center' }}>No packs found</div>}
        </div>

        <div className="pack-manager__footer">
          <div style={{ display: 'flex', gap: '0.4rem', flex: 1 }}>
            <input
              className="pack-manager__create-input"
              type="text"
              placeholder="New pack name..."
              value={newPackName}
              onChange={e => setNewPackName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newPackName.trim()) { createPack(BACKEND_URL, newPackName.trim()).then(() => { setNewPackName(''); reload(); }); } }}
            />
            <button className="btn btn--small btn--accent" disabled={busy || !newPackName.trim()} onClick={() => { createPack(BACKEND_URL, newPackName.trim()).then(() => { setNewPackName(''); reload(); }); }}>
              Create
            </button>
          </div>
          <button className="btn btn--small btn--ghost" onClick={() => importRef.current?.click()} disabled={busy}>
            <Upload size={14} /> Import
          </button>
          <input ref={importRef} type="file" accept=".zip,application/zip" style={{ display: 'none' }} onChange={handleImportFile} />
        </div>

        {/* ── Import Peek Dialog ── */}
        {peekData && (
          <div className="qe-overlay" onClick={() => setPeekData(null)}>
            <div className="qe-dialog" onClick={e => e.stopPropagation()}>
              <h3>Import Pack</h3>
              <div className="outlined-input" style={{ marginBottom: '0.75rem' }}>
                <input type="text" value={importName} onChange={e => setImportName(e.target.value)} />
                <label>Pack Name</label>
              </div>
              <p style={{ opacity: 0.7, margin: '0 0 0.75rem', fontSize: '0.85rem' }}>Select content to import:</p>
              {['avatars', 'videos', 'questions'].map(type => (
                <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', opacity: peekData.contents[type] > 0 ? 1 : 0.35 }}>
                  <input type="checkbox" checked={importSel[type]} disabled={peekData.contents[type] === 0}
                    onChange={e => setImportSel(s => ({ ...s, [type]: e.target.checked }))} />
                  {type} ({peekData.contents[type]})
                </label>
              ))}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button className="btn btn--ghost" onClick={() => setPeekData(null)}>Cancel</button>
                <button className="btn btn--accent" onClick={doImport} disabled={busy || !importName.trim()}>Import</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Export Selection Dialog ── */}
        {exportPack && (
          <div className="qe-overlay" onClick={() => setExportPack(null)}>
            <div className="qe-dialog" onClick={e => e.stopPropagation()}>
              <h3>Export: {exportPack.name || exportPack.id}</h3>
              <p style={{ opacity: 0.7, margin: '0.5rem 0 1rem', fontSize: '0.85rem' }}>Select content to include:</p>
              {['avatars', 'videos', 'questions'].map(type => (
                <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', opacity: exportPack.includes.includes(type) ? 1 : 0.35 }}>
                  <input type="checkbox" checked={exportSel[type]} disabled={!exportPack.includes.includes(type)}
                    onChange={e => setExportSel(s => ({ ...s, [type]: e.target.checked }))} />
                  {type}
                </label>
              ))}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button className="btn btn--ghost" onClick={() => setExportPack(null)}>Cancel</button>
                <button className="btn btn--accent" onClick={doExport}>Export</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
