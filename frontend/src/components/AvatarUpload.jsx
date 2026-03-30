import { useState, useRef } from 'react';
import { UploadCloud, X } from 'lucide-react';

export default function AvatarUpload({ onUploaded }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Not an image'); return; }
    setBusy(true); setError(null);
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = (e) => res(e.target.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const parts = dataUrl.split(',');
      const base64 = parts[1];
      const res = await fetch('/api/upload-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, data: base64, mimeType: file.type }),
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Upload failed');
      onUploaded?.(j.filename);
    } catch (e) {
      setError(e.message || String(e));
    } finally { setBusy(false); }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const onPick = () => inputRef.current?.click();
  const onFile = (e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; };

  return (
    <div className="avatar-upload" onDrop={onDrop} onDragOver={(e)=>e.preventDefault()}>
      <input type="file" accept="image/*" ref={inputRef} style={{ display: 'none' }} onChange={onFile} />
      <button type="button" className="btn btn--icon btn--ghost btn--small" onClick={onPick} title="Upload avatar">
        <UploadCloud />
      </button>
      {busy && <span className="avatar-upload-busy">…</span>}
      {error && <span className="avatar-upload-error" title={error}><X size={12} /></span>}
    </div>
  );
}

