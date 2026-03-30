import { Play, X, Flag } from 'lucide-react';
import { getPlayerName } from '../../../utils/player';
import RankBadge from '../../RankBadge';
import { useI18n } from '../../../i18n';
import { useGameStore } from '../../../store/gameStore';
import { useSessionStore } from '../../../store/sessionStore';
import { useQuizStore } from '../../../store/quizStore';
import { IS_CONTROL } from '../../../utils/viewMode';
import socket from '../../../services/socket';
import { useShallow } from 'zustand/shallow';
import useElapsed from '../../../hooks/useElapsed';

export default function TimerScreen() {
  const { timerPhase, timerCountdown, timerBuzzes, timerResult, timerScoringType, timerDuration } = useGameStore(
    useShallow(({ timerPhase, timerCountdown, timerBuzzes, timerResult, timerScoringType, timerDuration }) =>
      ({ timerPhase, timerCountdown, timerBuzzes, timerResult, timerScoringType, timerDuration }))
  );
  const timerElapsed = useElapsed('_timerStart', '_timerCap');
  const hasCountdown = timerDuration > 0;
  const remaining = hasCountdown ? Math.max(0, timerDuration - timerElapsed) : 0;
  const isWarning = hasCountdown && remaining > 0 && remaining <= 30000; // last 30s
  const { nameMap } = useSessionStore(useShallow(({ nameMap }) => ({ nameMap })));
  const isControl = IS_CONTROL;
  const visibleIndices   = useQuizStore(useShallow(s => s.getVisibleIndices()));
  const questionIndex    = useQuizStore(s => s.questionIndex);
  const currentQuestion  = useQuizStore(s => s.getCurrentQ());
  const navTo            = useQuizStore(s => s.navTo);
  const visiblePos = visibleIndices.indexOf(questionIndex);
  const questionsLength = visibleIndices.length;

  const onNextRound = () => {
    socket.emit('nextTimerRound');
    const nextIdx = visibleIndices[visiblePos + 1];
    if (nextIdx !== undefined) navTo(nextIdx);
    else socket.emit('setFinalScreen', { open: true });
  };
  const { t } = useI18n();
  return (
    <div className="timer-screen">
      {timerPhase === 'countdown' && timerCountdown !== null && (
        <div className="reflex-countdown">{timerCountdown}</div>
      )}
      {(timerPhase === 'countdown' || timerPhase === 'running') && currentQuestion && (
        <div className="question-text" style={{ textAlign: 'center', fontSize: 'clamp(1.2rem, 3vw, 2rem)', marginBottom: '0.5rem' }}>
          {currentQuestion.question}
        </div>
      )}
      {timerPhase === 'running' && (
        <>
          {hasCountdown ? (
            <>
              <div className={`timer-elapsed${isWarning ? ' timer-elapsed--warning' : ''}${remaining <= 0 ? ' timer-elapsed--zero' : ''}`}>
                {remaining <= 0 ? '0:00' : `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`}
              </div>
              <div className="timer-progress-wrap">
                <div className="timer-progress-bar" style={{ width: `${Math.max(0, (remaining / timerDuration) * 100)}%` }} />
              </div>
            </>
          ) : (
            <div className="timer-elapsed">{(timerElapsed / 1000).toFixed(2)}s</div>
          )}
          <p className="elim-hint">{t('timer_hint')}</p>
        </>
      )}
      <div className="reflex-live">
        {timerBuzzes.map((b, i) => (
          <div key={b.id} className="reflex-buzz-item">
            <span className="reflex-pos"><RankBadge i={i} /></span>
            <span className="reflex-name">{getPlayerName(b.id, nameMap)}</span>
            <span className="reflex-ms">{(b.ms / 1000).toFixed(2)}s</span>
          </div>
        ))}
      </div>
      {timerResult && (
        <div className="reflex-result">
          <h2>{t('timer_results')} <span style={{ fontSize: '0.65em', opacity: 0.55, fontWeight: 400 }}>{timerScoringType}</span></h2>
          {timerResult.awards.length === 0
            ? <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{t('nobody_buzzed')}</p>
            : timerResult.awards.map(a => (
              <div key={a.id} className="reflex-award">
                <span><RankBadge i={a.position - 1} /> {getPlayerName(a.id, nameMap)}</span>
                <span>{a.multiplier}× = <strong className={a.pts > 0 ? '' : 'score-pts'}>{a.pts >= 0 ? '+' : ''}{a.pts} pts</strong></span>
              </div>
            ))
          }
        </div>
      )}
      {isControl && timerPhase !== 'closed' && (
        <div className="reveal-btns" style={{ marginTop: '1.5rem' }}>
          {timerPhase === 'running' && (
            <button className="btn btn--accent btn--stretch" onClick={() => socket.emit('closeTimer')}>
              <Flag size={14} /> {t('end_round')}
            </button>
          )}
          <button className="btn btn--error" onClick={() => socket.emit('abortTimer')}>{t('abort')} <X size={13} /></button>
        </div>
      )}
      {isControl && timerPhase === 'closed' && (
        <button id="start-reflex" className="btn btn--accent" style={{ marginTop: '1.5rem' }} onClick={onNextRound}>
          <Play size={15} /> {questionIndex < questionsLength - 1 ? t('next_round') : t('finish_game')}
        </button>
      )}
    </div>
  );
}
