import { Play, X } from 'lucide-react';
import { getPlayerName } from '../../../utils/player';
import RankBadge from '../../RankBadge';
import { useI18n } from '../../../i18n';
import { useGameStore } from '../../../store/gameStore';
import { useSessionStore } from '../../../store/sessionStore';
import { IS_CONTROL } from '../../../utils/viewMode';
import socket from '../../../services/socket';
import { useShallow } from 'zustand/shallow';
import useElapsed from '../../../hooks/useElapsed';

export default function BombScreen() {
  const { bombPhase, bombDuration, bombBuzzes, bombResult } = useGameStore(
    useShallow(({ bombPhase, bombDuration, bombBuzzes, bombResult }) =>
      ({ bombPhase, bombDuration, bombBuzzes, bombResult }))
  );
  const bombElapsed = useElapsed('_bombStart', '_bombCap');
  const nameMap = useSessionStore(s => s.nameMap);
  const isControl = IS_CONTROL;
  const { t } = useI18n();
  return (
    <div className="bomb-screen">
      {bombPhase === 'ticking' && (
        <>
          <div className="bomb-fuse-wrap">
            <div className="bomb-fuse-bar" style={{ width: `${((bombDuration - bombElapsed) / bombDuration) * 100}%` }} />
          </div>
          <div className={`bomb-timer ${bombElapsed / bombDuration > 0.8 ? 'bomb-timer-danger' : ''}`}>
            {((bombDuration - bombElapsed) / 1000).toFixed(2)}s
          </div>
          <p className="elim-hint">{t('bomb_hint')}</p>
        </>
      )}
      <div className="reflex-live">
        {bombBuzzes.map((b, i) => (
          <div key={b.id} className="reflex-buzz-item">
            <span className="reflex-pos"><RankBadge i={i} /></span>
            <span className="reflex-name">{getPlayerName(b.id, nameMap)}</span>
            <span className="reflex-ms">{(b.remaining / 1000).toFixed(3)}{t('s_left')}</span>
          </div>
        ))}
      </div>
      {bombResult && (
        <div className="reflex-result">
          <h2>{t('bomb_results')}</h2>
          {bombResult.awards.length === 0
            ? <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{t('bomb_nobody')}</p>
            : bombResult.awards.map(a => (
              <div key={a.id} className="reflex-award">
                <span><RankBadge i={a.position - 1} /> {getPlayerName(a.id, nameMap)}</span>
                <span>{(a.remaining / 1000).toFixed(3)}{t('s_left')}  <strong>+{a.pts} {t('pts')}</strong></span>
              </div>
            ))
          }
        </div>
      )}
      {isControl && bombPhase !== 'closed' && (
        <button className="btn btn--error" onClick={() => socket.emit('abortBomb')}>{t('abort')} <X size={13} /></button>
      )}
      {isControl && bombPhase === 'closed' && (
        <button id="start-reflex" className="btn btn--accent" onClick={() => socket.emit('nextBombRound')}><Play size={15} /> {t('next_round')}</button>
      )}
    </div>
  );
}
