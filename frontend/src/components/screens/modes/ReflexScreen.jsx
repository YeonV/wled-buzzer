import { Play, X, Zap } from 'lucide-react';
import { getPlayerName } from '../../../utils/player';
import { REFLEX_COLOR_MAP } from '../../../utils/reflex';
import RankBadge from '../../RankBadge';
import { useI18n } from '../../../i18n';
import { useGameStore } from '../../../store/gameStore';
import { useSessionStore } from '../../../store/sessionStore';
import { IS_CONTROL } from '../../../utils/viewMode';
import { useShallow } from 'zustand/shallow';
import socket from '../../../services/socket';

export default function ReflexScreen({ style } = {}) {
  const { reflexPhase, reflexColor, reflexCountdown, reflexBuzzes, reflexFalseStarts, reflexResult, pointsStake } = useGameStore(
    useShallow(({ reflexPhase, reflexColor, reflexCountdown, reflexBuzzes, reflexFalseStarts, reflexResult, pointsStake }) =>
      ({ reflexPhase, reflexColor, reflexCountdown, reflexBuzzes, reflexFalseStarts, reflexResult, pointsStake }))
  );
  const nameMap = useSessionStore(s => s.nameMap);
  const isControl = IS_CONTROL;
  const { t } = useI18n();
  return (
    <div
      className="reflex-screen"
      style={{ backgroundColor: REFLEX_COLOR_MAP[reflexColor] ?? '#111111', ...style }}
    >
      {reflexCountdown !== null && (
        <div className="reflex-countdown">{reflexCountdown}</div>
      )}
      {reflexPhase === 'go' && !reflexResult && (
        <div className="reflex-go">{t('reflex_go')}</div>
      )}
      <div className="reflex-live">
        {reflexBuzzes.map((b, i) => (
          <div key={b.id} className="reflex-buzz-item">
            <span className="reflex-pos"><RankBadge i={i} /></span>
            <span className="reflex-name">{getPlayerName(b.id, nameMap)}</span>
            <span className="reflex-ms">+{b.ms}ms</span>
          </div>
        ))}
        {reflexFalseStarts.map(id => (
          <div key={id} className="reflex-false-start">
            <Zap size={14} /> {t('reflex_false_start', getPlayerName(id, nameMap))}
          </div>
        ))}
      </div>
      {reflexResult && (
        <div className="reflex-result">
          <h2>{t('reflex_results')}</h2>
          {reflexResult.awards.map(a => (
            <div key={a.id} className="reflex-award">
              <span><RankBadge i={a.position - 1} /> {getPlayerName(a.id, nameMap)}</span>
              <span className={a.pts < 0 ? 'score-pts neg' : ''}>{a.multiplier}× = {a.pts >= 0 ? '+' : ''}{a.pts} pts</span>
            </div>
          ))}
          {reflexResult.falseStarts.length > 0 && (
            <div className="reflex-penalty">
              {reflexResult.falseStarts.map(id => (
                <div key={id}><Zap size={13} /> {t('reflex_penalty', getPlayerName(id, nameMap), pointsStake)}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {isControl && reflexPhase !== 'closed' && (
        <button className="btn btn--error" onClick={() => socket.emit('abortReflex')}>{t('abort')} <X size={13} /></button>
      )}
      {isControl && reflexPhase === 'closed' && (
        <button id="start-reflex" className="btn btn--accent" onClick={() => socket.emit('nextReflexRound')}><Play size={15} /> {t('next_round')}</button>
      )}
    </div>
  );
}
