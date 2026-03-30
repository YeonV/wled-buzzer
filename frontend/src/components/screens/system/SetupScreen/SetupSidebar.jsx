import { Gamepad2, Play, Lightbulb, ExternalLink } from 'lucide-react';
import { useI18n } from '../../../../i18n';

const VIEWS = [
  { param: '',           label: 'Display' },
  { param: 'scoreboard', label: 'Scoreboard' },
  { param: 'moderator',  label: 'Moderator' },
  { param: 'master',     label: 'Master' },
];

function openView(param) {
  const url = param ? `${window.location.origin}?view=${param}` : window.location.origin;
  window.open(url, `_buzzer_${param || 'display'}`);
}

export default function SetupSidebar({ title, onStart, activeCount, canStart }) {
  const { t } = useI18n();
  return (
    <div className="setup-right">
      <div className="setup-right-inner" style={{ overflowY: 'auto', maxHeight: '100%', paddingBottom: '1rem' }}>
        <div className="setup-logo"><Gamepad2 size={48} /></div>
        <h1 className="setup-title">{title}</h1>
        <ol className="setup-instructions">
          <li>{t('setup_step_1')}</li>
          <li>{t('setup_step_2')}</li>
          <li>{t('setup_step_3')}</li>
          <li>{t('setup_step_4')}</li>
        </ol>

        {activeCount > 0 && (
          <div className="setup-active-count">
            {t('buzzers_ready', activeCount)}
          </div>
        )}

        <button
          className={`setup-start-btn${canStart ? ' setup-start-ready' : ''}`}
          disabled={!canStart}
          onClick={onStart}
        >
          {canStart ? <><Play size={15} fill='#000' /> {t('start_game')}</> : t('select_buzzers')}
        </button>

        {!canStart && (
          <p className="setup-tip"><Lightbulb size={13} /> {t('setup_tip')}</p>
        )}

        <div className="setup-view-links">
          {VIEWS.map(v => (
            <button key={v.param} className="btn btn--small btn--ghost btn--stretch" onClick={() => openView(v.param)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
