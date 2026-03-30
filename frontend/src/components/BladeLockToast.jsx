import { useI18n } from '../i18n';
import { useSessionStore } from '../store/sessionStore';
import { IS_CONTROL } from '../utils/viewMode';

export default function BladeLockToast() {
  const { t } = useI18n();
  const toast = useSessionStore(s => s.bladeLockToast);
  const isControl = IS_CONTROL;
  const onDismiss = () => useSessionStore.setState({ bladeLockToast: null });
  if (!toast) return null;
  const msgs = [t('blade_lock_1'), t('blade_lock_2'), t('blade_lock_3'), t('blade_lock_4'), t('blade_lock_5')];
  const msg = msgs[Math.min(toast.count, msgs.length) - 1] ?? msgs[msgs.length - 1];
  return (
    <div
      className={`blade-lock-toast${isControl ? ' blade-lock-toast--control' : ''}`}
      onClick={onDismiss}
    >
      <div className="blade-lock-icon">⚡</div>
      <div className="blade-lock-name">{toast.name}</div>
      <div className="blade-lock-msg">{msg}</div>
      {toast.penalty > 0 && <div className="blade-lock-penalty">-{toast.penalty} pts</div>}
      {toast.count >= 4 && <div className="blade-lock-sub">{t('blade_lock_offense', toast.count)}</div>}
    </div>
  );
}
