import React, { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { activateQuestionSet, fetchAvatarPacks, activateAvatarPack } from '../../../../services/api';
import { SUPPORTED_LANGS, THEMES } from '../../../../utils/config';
import { useI18n } from '../../../../i18n';
import { useGameStore } from '../../../../store/gameStore';
import { useShallow } from 'zustand/shallow';
import { useQuizStore } from '../../../../store/quizStore';
import { useSessionStore } from '../../../../store/sessionStore';
import { BACKEND_URL } from '../../../../utils/viewMode';
import socket from '../../../../services/socket';

export default function SelectsRow() {
  const { t, lang } = useI18n();
  const { questionSets, activeSet } = useQuizStore(useShallow(({ questionSets, activeSet }) => ({ questionSets, activeSet })));
  const autoWrongMs = useGameStore(s => s.autoWrongMs);
  const activeAvatarPack = useSessionStore(s => s.activeAvatarPack);
  const backendUrl = BACKEND_URL;

  const [avatarPacks, setAvatarPacks] = useState([]);

  useEffect(() => {
    fetchAvatarPacks(backendUrl).then(({ packs }) => setAvatarPacks(packs ?? [])).catch(() => {});
  }, [backendUrl]);

  const onAutoWrongChange = (ms) => { useGameStore.setState({ autoWrongMs: ms }); socket.emit('setAutoWrong', { ms }); };
  const onLangChange = (l) => socket.emit('setLang', { lang: l });
  const onThemeChange = (thm) => socket.emit('setTheme', { theme: thm });

  const openPackManager = () => useSessionStore.setState({ showPackManager: true });

  return (
    <div className="settings-selects-row">
      <button className="btn btn--icon btn--ghost" onClick={openPackManager} title="Pack Manager">
        <Package size={15} />
      </button>

      {Array.isArray(questionSets) && questionSets.length > 0 && (
        <div className="outlined-select">
          <select
            value={activeSet ?? 'default'}
            onChange={async (e) => { await activateQuestionSet(backendUrl, e.target.value); }}
          >
            {questionSets.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <label>{t('question_set')}</label>
        </div>
      )}

      <div className="outlined-select">
        <select
          value={activeAvatarPack || 'none'}
          onChange={async (e) => { await activateAvatarPack(backendUrl, e.target.value); }}
        >
          <option value="none">None</option>
          {avatarPacks.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <label>{t('avatar_pack') || 'Avatar Pack'}</label>
      </div>

      <div className="outlined-select">
        <select value={lang} onChange={e => onLangChange(e.target.value)}>
          {SUPPORTED_LANGS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <label>{t('language_label')}</label>
      </div>

      <div className="outlined-select">
        <select value={useGameStore.getState().theme ?? ''} onChange={e => onThemeChange(e.target.value)}>
          {THEMES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <label>{t('theme_label')}</label>
      </div>

      <div className="outlined-input">
        <input
          type="number"
          min="1"
          max="60"
          value={Math.round(autoWrongMs / 1000)}
          onChange={(e) => {
            const ms = Math.max(1000, Math.min(60000, Number(e.target.value) * 1000));
            onAutoWrongChange(ms);
          }}
        />
        <label>{t('answer_time_limit')}</label>
      </div>
    </div>
  );
}
