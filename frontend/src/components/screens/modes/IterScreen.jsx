import { Play, X, Square, Flag } from 'lucide-react';
import { getPlayerName } from '../../../utils/player';
import RankBadge from '../../RankBadge';
import { useI18n } from '../../../i18n';
import { useGameStore } from '../../../store/gameStore';
import { useSessionStore } from '../../../store/sessionStore';
import { useQuizStore } from '../../../store/quizStore';
import { IS_CONTROL } from '../../../utils/viewMode';
import socket from '../../../services/socket';
import useElapsed from '../../../hooks/useElapsed';

export default function IterScreen() {
  const iterPhase = useGameStore(s => s.iterPhase);
  const iterCurrent = useGameStore(s => s.iterCurrent);
  const iterElapsed = useElapsed('_iterStart', '_iterCap');
  const iterDuration = useGameStore(s => s.iterDuration);
  const iterTimes = useGameStore(s => s.iterTimes);
  const hasCountdown = iterDuration > 0;
  const remaining = hasCountdown ? Math.max(0, iterDuration - iterElapsed) : 0;
  const isWarning = hasCountdown && remaining > 0 && remaining <= 10000; // last 10s for per-player
  const iterResult = useGameStore(s => s.iterResult);
  const iterScoringType = useGameStore(s => s.iterScoringType);
  const iterAmounts = useGameStore(s => s.iterAmounts);
  const setIterAmounts = useGameStore(s => s.setIterAmounts);
  const seenIds = useSessionStore(s => s.seenIds);
  const nameMap = useSessionStore(s => s.nameMap);
  const isControl = IS_CONTROL;
  const getVisibleIndices = useQuizStore(s => s.getVisibleIndices);
  const visibleIndices = (typeof getVisibleIndices === 'function') ? getVisibleIndices() : [];
  const questionIndex = useQuizStore(s => s.questionIndex);
  const navTo = useQuizStore(s => s.navTo);
  const visiblePos = visibleIndices.indexOf(questionIndex);
  const questionsLength = visibleIndices.length;

  const onNextRound = () => {
    socket.emit('nextIterRound');
    const nextIdx = visibleIndices[visiblePos + 1];
    if (nextIdx !== undefined) navTo(nextIdx);
    else socket.emit('setFinalScreen', { open: true });
  };
  const { t } = useI18n();
  return (
    <div className="timer-screen iter-screen">
      {/* Current player running */}
      {iterPhase === 'running' && iterCurrent && (
        <div className="iter-running">
          <div className="iter-player-name">{getPlayerName(iterCurrent, nameMap)}</div>
          {hasCountdown ? (
            <>
              <div className={`timer-elapsed${isWarning ? ' timer-elapsed--warning' : ''}${remaining <= 0 ? ' timer-elapsed--zero' : ''}`}>
                {remaining <= 0 ? '0:00' : `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`}
              </div>
              <div className="timer-progress-wrap">
                <div className="timer-progress-bar" style={{ width: `${Math.max(0, (remaining / iterDuration) * 100)}%` }} />
              </div>
            </>
          ) : (
            <div className="timer-elapsed">{(iterElapsed / 1000).toFixed(2)}s</div>
          )}
          {isControl && (
            <button id="iter-stop-btn" className="btn btn--success" style={{}} onClick={() => socket.emit('iterStopPlayer')}>
              <Square size={16} fill='#000' /> {t('end_round')}
            </button>
          )}
        </div>
      )}
      {/* Waiting: roster as tappable cards */}
      {iterPhase === 'waiting' && isControl && seenIds.length > 0 && (
        <div className="iter-roster">
          <p className="elim-hint">{t('iter_hint')}</p>
          {seenIds.map(id => {
            const doneEntry = iterTimes.find(t => t.id === id);
            const done = !!doneEntry;
            return (
              <button
                key={id}
                className={`iter-player-btn${done ? ' iter-player-btn--done' : ''}`}
                disabled={done}
                onClick={() => socket.emit('iterStartPlayer', { id })}
              >
                <span>{getPlayerName(id, nameMap)}</span>
                {done && <span className="iter-done-time">{(doneEntry.ms / 1000).toFixed(2)}s ✓</span>}
              </button>
            );
          })}
        </div>
      )}
      {/* Completed attempts sorted by time/amount */}
      {iterTimes.length > 0 && (
        <div className="reflex-live">
          {[...iterTimes].sort((a, b) =>
            iterScoringType === 'longest' ? b.ms - a.ms : a.ms - b.ms
          ).map((b, i) => (
            <div key={b.id} className="reflex-buzz-item">
              <span className="reflex-pos"><RankBadge i={i} /></span>
              <span className="reflex-name">{getPlayerName(b.id, nameMap)}</span>
              <span className="reflex-ms">{(b.ms / 1000).toFixed(2)}s</span>
              {iterScoringType === 'amount' && !iterResult && isControl && (
                <input
                  type="number" min="0"
                  className="iter-amount-input"
                  placeholder={t('iter_amount_placeholder')}
                  value={iterAmounts[b.id] ?? ''}
                  onChange={e => setIterAmounts(prev => ({ ...prev, [b.id]: e.target.value }))}
                  onClick={e => e.stopPropagation()}
                />
              )}
              {iterScoringType === 'amount' && iterResult && (
                <span className="iter-done-time">{iterResult.awards.find(a => a.id === b.id)?.amount ?? '—'}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Final results */}
      {iterResult && (
        <div className="reflex-result">
          <h2>{t('iter_results')}</h2>
          {iterResult.awards.length === 0
            ? <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{t('iter_no_attempts')}</p>
            : iterResult.awards.map(a => (
              <div key={a.id} className="reflex-award">
                <span><RankBadge i={a.position - 1} /> {getPlayerName(a.id, nameMap)}</span>
                <span>
                  {iterResult.scoringType === 'amount' && a.amount != null && (
                    <span className="iter-done-time" style={{ marginRight: '0.5rem' }}>{a.amount}</span>
                  )}
                  {a.multiplier}× = <strong>{a.pts >= 0 ? '+' : ''}{a.pts} pts</strong>
                </span>
              </div>
            ))
          }
        </div>
      )}
      {isControl && iterPhase === 'waiting' && iterTimes.length > 0 && !iterResult && (
        <button className="btn btn--accent btn--stretch" style={{ marginTop: '1rem' }} onClick={() =>
          socket.emit('iterFinish', iterScoringType === 'amount'
            ? { amounts: Object.entries(iterAmounts).map(([id, amount]) => ({ id, amount: Number(amount) })) }
            : {})
        }>
          <Flag size={15} /> {t('iter_finish')}
        </button>
      )}
      {isControl && iterPhase !== 'closed' && (
        <div className="reveal-btns" style={{ marginTop: '1rem' }}>
          <button className="btn btn--error" style={{ left: 16, width: 'calc(100% - 32px)', bottom: 20}} onClick={() => socket.emit('abortIter')}>{t('abort')} <X size={13} /></button>
        </div>
      )}
      {isControl && iterPhase === 'closed' && (
        <button id="start-reflex" className="btn btn--accent" style={{ marginTop: '1.5rem' }} onClick={onNextRound}>
          <Play size={15} /> {questionIndex < questionsLength - 1 ? t('next_round') : t('finish_game')}
        </button>
      )}
    </div>
  );
}
