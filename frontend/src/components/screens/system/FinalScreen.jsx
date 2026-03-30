import { BarChart2 } from 'lucide-react';
import { getPlayerName } from '../../../utils/player';
import { useI18n } from '../../../i18n';
import { useSessionStore } from '../../../store/sessionStore';
import { useGameStore } from '../../../store/gameStore';
import { useAudioStore } from '../../../store/audioStore';
import { IS_CONTROL, IS_MODERATOR } from '../../../utils/viewMode';
import socket from '../../../services/socket';
import { useShallow } from 'zustand/shallow';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function FinalScreen() {
  const { t } = useI18n();
  const { seenIds, nameMap } = useSessionStore(useShallow(({ seenIds, nameMap }) => ({ seenIds, nameMap })));
  const scores = useGameStore(s => s.scores);
  const { championPlaying, stopChampion } = useAudioStore(useShallow(({ championPlaying, stopChampion }) => ({ championPlaying, stopChampion })));
  const isControl = IS_CONTROL;
  const isModerator = IS_MODERATOR;
  const sorted = [...seenIds].map(id => ({ id, pts: scores[id] ?? 0 })).sort((a, b) => b.pts - a.pts);
  // podium display order: silver (1) left, gold (0) centre, bronze (2) right
  const podiumSlots = [1, 0, 2].filter(i => sorted[i]);

  return (
    <div className={`fullscreen state-idle${isModerator ? ' fullscreen--moderator' : ''}`}>
      <div className="final-screen">
        <div className="final-title">{t('final_title')}</div>

        {sorted.length > 0 && (
          <div className="final-podium">
            {podiumSlots.map(i => (
              <div key={i} className={`final-podium-slot final-podium-slot--${['gold', 'silver', 'bronze'][i]}`}>
                <div className="final-podium-medal">{MEDALS[i]}</div>
                <div className="final-podium-name">{getPlayerName(sorted[i].id, nameMap)}</div>
                <div className="final-podium-pts">{sorted[i].pts} {t('pts')}</div>
              </div>
            ))}
          </div>
        )}

        {sorted.length > 3 && (
          <div className="final-rest">
            {sorted.slice(3).map((p, i) => (
              <div key={p.id} className="final-rest-row">
                <span className="final-rest-rank">#{i + 4}</span>
                <span className="final-rest-name">{getPlayerName(p.id, nameMap)}</span>
                <span className="final-rest-pts">{p.pts} {t('pts')}</span>
              </div>
            ))}
          </div>
        )}

        {isControl && (
          <div className="final-actions">
            {championPlaying && (
              <button className="btn btn--error" onClick={stopChampion}>
                {t('stop_champion')}
              </button>
            )}
            <button className="btn btn--accent" onClick={() => { socket.emit('setFinalScreen', { open: false }); socket.emit('setStatsOpen', { open: true }); }}>
              <BarChart2 size={15} /> {t('round_history')}
            </button>
            <button className="btn btn--ghost" onClick={() => socket.emit('setFinalScreen', { open: false })}>
              {t('final_continue')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
