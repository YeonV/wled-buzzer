import { RotateCcw, Trash2 } from 'lucide-react';
import { useI18n } from '../../../../i18n';
import { useSessionStore } from '../../../../store/sessionStore';
import { useShallow } from 'zustand/shallow';
import { useGameStore } from '../../../../store/gameStore';
import QuickActions from './QuickActions';
import socket from '../../../../services/socket';

export default function NameTable() {
  const { t } = useI18n();
  const { seenIds, draft, setDraft, draftScores, setDraftScores, removeRow } = useSessionStore(
    useShallow(({ seenIds, draft, setDraft, draftScores, setDraftScores, removeRow }) => ({ seenIds, draft, setDraft, draftScores, setDraftScores, removeRow }))
  );
  const mqttClientIpMap = useGameStore(s => s.mqttClientIpMap);

  const allIds = [...new Set([...seenIds, ...Object.keys(draft)])];

  const onRemoveRow = (id) => removeRow(id);
  const onResetScores = () => { if (window.confirm(t('reset_scores_confirm'))) socket.emit('resetScores'); };

  return (
    <>
      <div className="name-table-header">
        <QuickActions />
      </div>

      <table className="name-table">
        <thead>
          <tr><th>{t('col_device_id')}</th>
          <th>{t('col_display_name')}</th>
          <th><span className="col-points-header">{t('col_points')}<button className="reset-col-btn" onClick={onResetScores} title={t('reset_scores')}><RotateCcw size={12} /></button></span></th>
          <th></th></tr>
        </thead>
        <tbody>
          {allIds.length === 0 && (
            <tr><td colSpan={4} className="no-devices">{t('no_devices')}</td></tr>
          )}
          {allIds.map((id) => (
            <tr key={id}>
              <td className="device-id">
                {id}
                {mqttClientIpMap[id] && <a href={`http://${mqttClientIpMap[id]}`} className="device-ip" target="_blank" rel="noopener noreferrer">{mqttClientIpMap[id]}</a>}
              </td>
              <td>
                <input
                  className="name-input"
                  value={draft[id] ?? ''}
                  placeholder={id.toUpperCase()}
                  onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
                />
              </td>
              <td>
                <input
                  className="score-input"
                  type="number"
                  value={draftScores[id] ?? 0}
                  onChange={(e) => setDraftScores((d) => ({ ...d, [id]: e.target.value }))}
                />
              </td>
              <td>
                <button className="btn btn--hover--error btn--icon" onClick={() => onRemoveRow(id)} title={t('cancel')}><Trash2 size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
