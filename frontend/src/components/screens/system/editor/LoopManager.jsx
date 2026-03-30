/**
 * LoopManager — Loop audio section: list, rename, delete, upload.
 */
import { useRef } from 'react';

export default function LoopManager({
  loops, loopNameDrafts,
  onLoopNameChange, onSaveLoopName, onDeleteLoop, onUploadAudio,
  audioUploading, audioError, audioDragging,
  onAudioDragOver, onAudioDragLeave, onAudioDrop,
  getLoopUrl, nextLoopN, editingSet, t,
}) {
  const audioFileRef = useRef(null);

  return (
    <div className="qe-audio-section">
      <div className="qe-audio-header">{t('qe_loops_title')}{editingSet ? ` \u2014 ${editingSet}` : ''}</div>
      <div className="qe-audio-list">
        {loops.length === 0 && <div className="qe-audio-empty">{t('qe_loops_empty')}</div>}
        {loops.map(n => (
          <div key={n} className="qe-audio-item">
            <span className="qe-audio-label">Loop {n}</span>
            {getLoopUrl(n) && <audio controls src={getLoopUrl(n)} className="qe-audio-player" preload="none" />}
            <input
              className="qe-loop-name-input"
              value={loopNameDrafts[n] ?? ''}
              placeholder={t('qe_loop_placeholder')}
              onChange={e => onLoopNameChange(n, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSaveLoopName(n); }}
            />
            <button className="qe-icon-btn" onClick={() => onSaveLoopName(n)} title="Save name">{'\uD83D\uDCBE'}</button>
            <button className="qe-icon-btn qe-delete" onClick={() => onDeleteLoop(n)} title={`Delete loop${n}.mp3`}>{'\uD83D\uDDD1'}</button>
          </div>
        ))}
      </div>
      <div
        className={`qe-audio-drop${audioDragging ? ' qe-audio-drop--over' : ''}`}
        onDragOver={onAudioDragOver}
        onDragLeave={onAudioDragLeave}
        onDrop={onAudioDrop}
        onClick={() => audioFileRef.current?.click()}
      >
        {audioUploading ? t('qe_uploading') : t('qe_drop_audio', nextLoopN)}
        <input ref={audioFileRef} type="file" accept="audio/mpeg,.mp3" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onUploadAudio(f); e.target.value = ''; }} />
      </div>
      {audioError && <div className="qe-img-error">{audioError}</div>}
    </div>
  );
}
