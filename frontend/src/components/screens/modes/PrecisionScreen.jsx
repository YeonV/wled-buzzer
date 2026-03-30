import { Play, X, Target } from 'lucide-react';
import { getPlayerName } from '../../../utils/player';
import RankBadge from '../../RankBadge';
import { useI18n } from '../../../i18n';
import { useGameStore } from '../../../store/gameStore';
import { useSessionStore } from '../../../store/sessionStore';
import { IS_CONTROL } from '../../../utils/viewMode';
import socket from '../../../services/socket';
import { useShallow } from 'zustand/shallow';

export default function PrecisionScreen() {
  const { precisionPhase, precisionCountdown, precisionTarget, precisionBuzzes, precisionResult } = useGameStore(
    useShallow(({ precisionPhase, precisionCountdown, precisionTarget, precisionBuzzes, precisionResult }) =>
      ({ precisionPhase, precisionCountdown, precisionTarget, precisionBuzzes, precisionResult }))
  );
  const nameMap = useSessionStore(s => s.nameMap);
  const isControl = IS_CONTROL;
  const { t } = useI18n();
  return (
    <div className="precision-screen">
      {precisionPhase === 'countdown' && precisionCountdown !== null && (
        <div className="reflex-countdown">{precisionCountdown}</div>
      )}
      {precisionPhase === 'waiting' && (
        <>
          <div className="precision-cue"><Target /></div>
          <div className="precision-target-display">{t('precision_target', (precisionTarget / 1000).toFixed(1))}</div>
          <p className="precision-hint">{t('precision_hint', (precisionTarget / 1000).toFixed(1))}</p>
        </>
      )}
      <div className="reflex-live">
        {precisionBuzzes.map((b, i) => (
          <div key={b.id} className="reflex-buzz-item">
            <span className="reflex-pos"><RankBadge i={i} /></span>
            <span className="reflex-name">{getPlayerName(b.id, nameMap)}</span>
            <span className="reflex-ms">{(b.ms / 1000).toFixed(3)}s  <span className="precision-error">±{b.error}ms</span></span>
          </div>
        ))}
      </div>
      {precisionResult && (
        <div className="reflex-result">
          <h2>{t('precision_results')}</h2>
          <p className="precision-result-target">{t('precision_target_was', (precisionResult.target / 1000).toFixed(1))}</p>
          {precisionResult.awards.map(a => (
            <div key={a.id} className="reflex-award">
              <span><RankBadge i={a.position - 1} /> {getPlayerName(a.id, nameMap)}</span>
              <span>±{a.error}ms  <strong className={a.pts > 0 ? '' : 'score-pts neg'}>+{a.pts} pts</strong></span>
            </div>
          ))}
        </div>
      )}
      {isControl && precisionPhase !== 'closed' && (
        <button className="btn btn--error btn--fw abort-reflex" onClick={() => socket.emit('abortPrecision')}>{t('abort')} <X size={13} /></button>
      )}
      {isControl && precisionPhase === 'closed' && (
        <button id="start-reflex" className="btn btn--accent" onClick={() => socket.emit('nextPrecisionRound')}><Play size={15} /> {t('next_round')}</button>
      )}
    </div>
  );
}
