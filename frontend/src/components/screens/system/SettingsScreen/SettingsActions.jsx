import React from 'react';
import { CheckCircle2, X, LogOut } from 'lucide-react';
import { useI18n } from '../../../../i18n';
import { useSessionStore } from '../../../../store/sessionStore';
import socket from '../../../../services/socket';

export default function SettingsActions() {
  const { t } = useI18n();
  const saveNames = useSessionStore(s => s.saveNames);

  const onClose = () => useSessionStore.setState({ showSettings: false });
  const onSave = () => saveNames(socket);
  const onEndGame = () => {
    if (!window.confirm(t('end_game_confirm') ?? 'End the current game and return to setup?')) return;
    socket.emit('endGame');
    useSessionStore.setState({ showSettings: false });
  };

  return (
    <div className="settings-actions">
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn--error btn--small" onClick={onEndGame}><LogOut size={14} /> {t('end_game') ?? 'End Game'}</button>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn--ghost" onClick={onClose}><X size={14} /> {t('cancel')}</button>
          <button className="btn btn--success" onClick={onSave}><CheckCircle2 size={14} /> {t('save')}</button>
        </div>
      </div>
    </div>
  );
}
