import { Play, X, Bomb, Timer, Trophy } from 'lucide-react';
import { getPlayerName } from '../../../utils/player';
import { useI18n } from '../../../i18n';
import { useGameStore } from '../../../store/gameStore';
import { useSessionStore } from '../../../store/sessionStore';
import { IS_CONTROL } from '../../../utils/viewMode';
import socket from '../../../services/socket';
import { useShallow } from 'zustand/shallow';
import useCountdown from '../../../hooks/useCountdown';

export default function EliminationScreen() {
  const { eliminationPhase, eliminationBuzzes, eliminationResult } = useGameStore(
    useShallow(({ eliminationPhase, eliminationBuzzes, eliminationResult }) =>
      ({ eliminationPhase, eliminationBuzzes, eliminationResult }))
  );
  const eliminationTick = useCountdown('_elimStart', '_elimDuration');
  const nameMap = useSessionStore(s => s.nameMap);
  const isControl = IS_CONTROL;
  const { t } = useI18n();
  return (
    <div className="elimination-screen">
      {eliminationPhase === 'open' && (
        <>
          <div className="elim-title">{t('elim_title')}</div>
          <p className="elim-hint">{t('elim_hint')}</p>
          {eliminationTick !== null && eliminationTick > 0 && (
            <div className="elim-bar-wrap">
              <div className="elim-bar" style={{ width: `${(eliminationTick / 6000) * 100}%` }} />
              <span className="elim-timer">{(eliminationTick / 1000).toFixed(1)}s</span>
            </div>
          )}
        </>
      )}
      <div className="reflex-live">
        {[...eliminationBuzzes].reverse().map((b, i) => (
          <div key={b.id} className={`reflex-buzz-item ${i === 0 ? 'elim-last' : ''}`}>
            <span className="reflex-pos">{i === 0 ? <Bomb size={18} /> : <Timer size={16} style={{ opacity: 0.45 }} />}</span>
            <span className="reflex-name">{getPlayerName(b.id, nameMap)}</span>
            <span className="reflex-ms">{i === 0 ? t('elim_latest') : t('elim_earlier')}</span>
          </div>
        ))}
      </div>
      {eliminationResult && (
        <div className="reflex-result">
          <h2>{t('elim_results')}</h2>
          {eliminationResult.noBuzz
            ? <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{t('nobody_buzzed')}</p>
            : eliminationResult.awards.map(a => (
              <div key={a.id} className="reflex-award">
                <span>
                  {a.tag === 'winner' ? <Trophy size={16} style={{ color: '#ffd700' }} /> : a.tag === 'loser' ? <X size={16} style={{ color: '#ff5555' }} /> : null} {getPlayerName(a.id, nameMap)}
                </span>
                <span className={a.pts < 0 ? 'score-pts neg' : a.pts > 0 ? '' : 'score-pts'}>
                  {a.pts >= 0 ? '+' : ''}{a.pts} pts
                </span>
              </div>
            ))
          }
        </div>
      )}
      {isControl && eliminationPhase !== 'closed' && (
        <button className="btn btn--error btn--fw abort-reflex" onClick={() => socket.emit('abortElimination')}>{t('abort')} <X size={13} /></button>
      )}
      {isControl && eliminationPhase === 'closed' && (
        <button id="start-reflex" className="btn btn--accent" onClick={() => socket.emit('nextEliminationRound')}><Play size={15} /> {t('next_round')}</button>
      )}
    </div>
  );
}
