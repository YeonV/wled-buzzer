/* eslint-disable no-empty */
/* eslint-disable no-unused-vars */
import { Radio, Settings } from 'lucide-react';
import FullscreenButton from '../../../FullscreenButton';
import { useI18n } from '../../../../i18n';
import { useSessionStore } from '../../../../store/sessionStore';
import { IS_MODERATOR } from '../../../../utils/viewMode';
import { useState, useEffect } from 'react';
import socket from '../../../../services/socket';

const LS_ROSTER = 'buzzer-roster';

export default function QuickActions() {
  const { t } = useI18n();
  const addRow = useSessionStore(s => s.addRow);

  const [scanning, setScanning] = useState(false);
  const showSettings = useSessionStore(s => s.showSetupSettings);
  const setShowSettings = (v) => useSessionStore.setState({ showSetupSettings: typeof v === 'function' ? v(showSettings) : v });

  useEffect(() => {
    const onProgress = () => setScanning(true);
    const onDone = () => setScanning(false);
    socket.on('wledScanProgress', onProgress);
    socket.on('wledScanDone', onDone);
    return () => {
      socket.off('wledScanProgress', onProgress);
      socket.off('wledScanDone', onDone);
    };
  }, []);

  const onScanWleds = () => {
    // trigger a scan on the backend; SetupScreen listens for scan events
    try { socket.emit('discoverWleds'); } catch (_) {}
    setScanning(true);
  };
  const onAddRow = () => addRow();

  const clearStorage = () => {
    if (!window.confirm(t('confirm_clear_roster'))) return;
    try { sessionStorage.removeItem(LS_ROSTER); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('buzzer:rosterCleared')); } catch (_) {}
  };

  return (
    <div className="name-table-actions">
      <button
        className="btn btn--hover--info btn--icon"
        onClick={onScanWleds}
        title={t('scan_wleds')}
        aria-pressed={scanning}
      >
        <Radio size={15} style={{ color: scanning ? 'var(--c-accent, #00aa3c)' : undefined }} />
      </button>
      <button className="btn btn--icon" onClick={onAddRow} title={t('add_row')}><span style={{fontSize:'1.1rem', lineHeight:1}}>＋</span></button>
      <FullscreenButton className="btn btn--icon" iconSize={15} />
      <button className={`btn btn--icon${showSettings ? ' btn--accent' : ''}`} onClick={() => setShowSettings(s => !s)} title="Settings">
        <Settings size={15} />
      </button>
      <button className="btn btn--hover--error btn--icon" onClick={clearStorage} title={t('clear')}>✕</button>
    </div>
  );
}
