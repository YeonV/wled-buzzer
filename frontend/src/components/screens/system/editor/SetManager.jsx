/**
 * SetManager — Question set selector + create/delete UI.
 * Pure presentational component — no data fetching.
 */

export default function SetManager({ questionSets, editingSet, activeSet, onSelectSet, newSetName, onNewSetNameChange, onCreateSet, onDeleteSet, t }) {
  return (
    <div className="qe-audio-section">
      <div className="qe-audio-header">{t('qe_sets_title')}</div>
      <div className="qe-audio-list">
        {questionSets.map(s => (
          <div
            key={s}
            className={`qe-audio-item${editingSet === s ? ' qe-audio-item--active' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelectSet(s)}
          >
            <span className="qe-audio-label">{s}</span>
            {activeSet === s && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.6 }}>{t('qe_live')}</span>}
            {s !== 'default' && (
              <button
                className="qe-icon-btn qe-delete"
                onClick={e => { e.stopPropagation(); onDeleteSet(s); }}
                title={`Delete set "${s}"`}
              >{'\uD83D\uDDD1'}</button>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
        <input
          className="name-input"
          placeholder={t('qe_add_set_placeholder')}
          value={newSetName}
          onChange={e => onNewSetNameChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onCreateSet(); }}
          style={{ flex: 1 }}
        />
        <button className="qe-btn qe-btn-secondary" onClick={onCreateSet} disabled={!newSetName.trim()}>{t('qe_create_set')}</button>
      </div>
    </div>
  );
}
