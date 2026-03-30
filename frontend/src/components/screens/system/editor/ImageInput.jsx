/**
 * ImageInput — Shared image URL field + file upload + drag-and-drop component.
 *
 * Props:
 *   value       — current image path/URL
 *   onChange     — called with new path/URL string
 *   placeholder  — placeholder text
 *   onUpload    — async (file) => storedPath  — handles the actual storage
 *   resolveUrl  — (path) => displayableURL    — default: identity
 *   compact     — boolean, renders inline variant
 */
import { useRef, useState } from 'react';
import { useI18n } from '../../../../i18n';

const identity = (v) => v || '';

export default function ImageInput({ value, onChange, placeholder, onUpload, resolveUrl = identity, compact = false }) {
  const { t } = useI18n();
  const [dragging,  setDragging]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState(null);
  const fileRef = useRef(null);

  const resolved = resolveUrl(value);

  const uploadFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) { setError('Not an image file'); return; }
    setUploading(true); setError(null);
    try {
      const storedPath = await onUpload(file);
      onChange(storedPath);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    // 1. filesystem file
    const file = e.dataTransfer.files?.[0];
    if (file) { uploadFile(file); return; }
    // 2. image dragged from browser (uri-list)
    const uriList = e.dataTransfer.getData('text/uri-list');
    if (uriList) { onChange(uriList.split(/\r?\n/).find(u => u && !u.startsWith('#')) ?? ''); return; }
    // 3. HTML fragment
    const html = e.dataTransfer.getData('text/html');
    if (html) { const m = html.match(/src=["']([^"']+)["']/i); if (m?.[1]) { onChange(m[1]); return; } }
    // 4. plain text
    const text = e.dataTransfer.getData('text/plain');
    if (text?.trim()) onChange(text.trim());
  };

  const dragProps = {
    onDragOver:  e => { e.preventDefault(); setDragging(true); },
    onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); },
    onDrop:      handleDrop,
  };

  // ─ Compact (inline) variant ─ just a small drop-target button + thumbnail
  if (compact) return (
    <div
      className={`qe-img-wrap qe-img-wrap--compact${dragging ? ' qe-img-wrap--over' : ''}`}
      title={value?.trim() ? 'Drop / click to replace image' : `Drop or click to add image for ${placeholder}`}
      {...dragProps}
    >
      {resolved && (
        <img src={resolved} alt="" className="qe-img-preview qe-img-preview--compact"
          onError={e => { e.target.style.display = 'none'; }}
          onLoad={e  => { e.target.style.display = '';     }} />
      )}
      <button type="button" className="qe-img-upload-btn qe-img-upload-btn--compact"
        title={uploading ? 'Uploading...' : 'Upload or drop image'}
        disabled={uploading} onClick={() => fileRef.current?.click()}>
        {uploading ? '...' : resolved ? '\uD83D\uDDBC\uFE0F' : '+'}
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
    </div>
  );

  return (
    <div
      className={`qe-img-wrap${dragging ? ' qe-img-wrap--over' : ''}`}
      {...dragProps}
    >
      <div className="qe-img-row">
        <input
          type="text"
          className="qe-image-input"
          placeholder={placeholder}
          value={value ?? ''}
          onChange={e => { setError(null); onChange(e.target.value); }}
        />
        <button type="button" className="qe-img-upload-btn" title="Upload image"
          disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? '...' : '+'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
      </div>
      {error && <div className="qe-img-error">{error}</div>}
      {!resolved && !error && (
        <div className="qe-img-drop-hint">{t('qe_img_drop_hint')}</div>
      )}
      {resolved && (
        <img src={resolved} alt="" className="qe-img-preview"
          onError={e => { e.target.style.display = 'none'; }}
          onLoad={e  => { e.target.style.display = '';     }} />
      )}
    </div>
  );
}
