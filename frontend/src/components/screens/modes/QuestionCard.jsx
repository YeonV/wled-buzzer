import { Eye, EyeOff, Megaphone, CheckCircle2, XCircle, RotateCcw, Timer, Hourglass, Undo2, List, Lightbulb } from 'lucide-react';
import { useState, useRef, useCallback, useMemo } from 'react';
import { useGameStore }    from '../../../store/gameStore';
import { useSessionStore } from '../../../store/sessionStore';
import { useQuizStore }    from '../../../store/quizStore';
import { IS_CONTROL, IS_MASTER, IS_MODERATOR } from '../../../utils/viewMode';
import { DISPLAY_ONLY_MODES, answerText, answerImage } from '../../../utils/questions';
import { emitLoopControl, emitJudgeAnswer } from '../../../services/socketActions';
import IntroSlide from './IntroSlide';
import RulesSlide from './RulesSlide';
import QuizImage from '../../QuizImage';
import { checkAnswer } from '../../../utils/fuzzy';
import { useI18n } from '../../../i18n';
import socket from '../../../services/socket';
import { useShallow } from 'zustand/shallow';

// QuestionCard is a stable file-level component — this prevents the remount-on-every-render
// bug that occurred when it was defined as an inline closure inside App.jsx.
export default function QuestionCard() {
  const { t } = useI18n();
  const { gameMode, winner, verdict, pointsStake, iterPhase, presetsReady, hintIndex, lockedOutIds } = useGameStore(
    useShallow(({ gameMode, winner, verdict, pointsStake, iterPhase, presetsReady, hintIndex, lockedOutIds }) =>
      ({ gameMode, winner, verdict, pointsStake, iterPhase, presetsReady, hintIndex, lockedOutIds }))
  );

  const nameMap = useSessionStore(s => s.nameMap);
  // ── Undo long-press (hold 800ms to confirm) ────────────────────────────
  const [undoProgress, setUndoProgress] = useState(false);
  const undoTimer = useRef(null);
  const onUndoDown = useCallback(() => {
    setUndoProgress(true);
    undoTimer.current = setTimeout(() => {
      socket.emit('undoLastRound');
      setUndoProgress(false);
    }, 800);
  }, []);
  const onUndoUp = useCallback(() => {
    clearTimeout(undoTimer.current);
    setUndoProgress(false);
  }, []);
  const {
    questions, questionIndex,
    showQuestion, showAnswer, showAnswersOnly, localShowAnswer, answerReveal,
    navTo, setLocalShowAnswer, getCurrentQ, getVisibleIndices,
  } = useQuizStore(
    useShallow(({ questions, questionIndex, showQuestion, showAnswer, showAnswersOnly, localShowAnswer, answerReveal,
      navTo, setLocalShowAnswer, getCurrentQ, getVisibleIndices }) =>
      ({ questions, questionIndex, showQuestion, showAnswer, showAnswersOnly, localShowAnswer, answerReveal,
        navTo, setLocalShowAnswer, getCurrentQ, getVisibleIndices }))
  );

  const currentQ      = getCurrentQ();
  const visibleIndices = getVisibleIndices();
  const visiblePos    = visibleIndices.indexOf(questionIndex);

  // ── Chapter jump menu ─────────────────────────────────────────────────
  const [chapterOpen, setChapterOpen] = useState(false);
  const chapters = useMemo(() => {
    const result = [];
    let current = null;
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i]) continue;
      if (questions[i].chapter) current = { label: questions[i].chapter, index: i };
      if (current && visibleIndices.includes(i) && result[result.length - 1]?.label !== current.label) {
        result.push({ ...current, visiblePos: visibleIndices.indexOf(i) });
      }
    }
    return result;
  }, [questions, visibleIndices]);
  const currentChapter = useMemo(() => {
    let ch = null;
    for (let i = 0; i <= questionIndex; i++) {
      if (questions[i]?.chapter) ch = questions[i].chapter;
    }
    return ch;
  }, [questions, questionIndex]);

  if (!IS_CONTROL || !presetsReady || !currentQ) return null;
  if (!['quiz','hint','timer','itimer','video','chain','estimate'].includes(gameMode)) return null;

  const q = currentQ;

  return (
    <div className="question-card">
      <div className="question-nav">
        <button
          className="btn btn--icon"
          disabled={visiblePos <= 0}
          onClick={() => { const p = visibleIndices[visiblePos - 1]; if (p !== undefined) navTo(p); }}
        >&#9664;</button>
        <span className="question-counter">{visiblePos >= 0 ? visiblePos + 1 : '?'} / {visibleIndices.length}</span>
        {visiblePos >= visibleIndices.length - 1 ? (
          <button className="btn btn--accent btn--icon" onClick={() => socket.emit('setFinalScreen', { open: true })} title="Finish Game">&#127942;</button>
        ) : (
          <button
            className="btn btn--icon"
            disabled={visiblePos >= visibleIndices.length - 1}
            onClick={() => { const n = visibleIndices[visiblePos + 1]; if (n !== undefined) navTo(n); }}
          >&#9654;</button>
        )}
        {chapters.length > 0 && (
          <div className="chapter-menu-wrap">
            <button className="btn btn--icon chapter-menu-toggle" onClick={() => setChapterOpen(o => !o)} title={t('chapters')}><List size={16} /></button>
            {chapterOpen && (
              <div className="chapter-menu">
                {chapters.map((ch, i) => (
                  <button
                    key={i}
                    className={`chapter-menu-item${ch.label === currentChapter ? ' chapter-menu-item--active' : ''}`}
                    onClick={() => { navTo(ch.index); setChapterOpen(false); }}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {currentChapter && <div className="question-chapter-label">{currentChapter}</div>}

      {q.mode === 'intro' ? (
        <IntroSlide question={q.question} />
      ) : q.mode === 'rules' ? (
        <RulesSlide question={q.question} />
      ) : q.mode === 'video' ? (
        <div className="video-slide video-slide--moderator">
          {q.video && <video src={q.video} className="video-slide__player" controls preload="metadata" />}
          {q.question && <div className="video-slide__title">{q.question}</div>}
        </div>
      ) : (
        <>
          {q.pretext && !showQuestion
            ? <div className="question-text question-text--pretext">{q.pretext}</div>
            : q.question && <div className="question-text">{q.question}</div>
          }
          {!(q.pretext && !showQuestion) && <QuizImage src={q.questionImage} className="question-img" position={q.questionImagePosition} />}
        </>
      )}

      {gameMode === 'quiz' && q.mode !== 'text' && !(q.pretext && !showQuestion) && q.mode !== 'intro' && q.mode !== 'rules' && q.answers ? (
        <div className={`question-answers${q.answers.some(a => answerImage(a)) ? ' question-answers--grid' : ''}`}>
          {q.answers.map((a, i) => {
            const txt = answerText(a);
            const img = answerImage(a);
            const isClickable = IS_MODERATOR && !!winner && !verdict;
            const Tag = isClickable ? 'button' : 'div';
            const revealActive = !isClickable && answerReveal.correctIndex !== null;
            const isCorrectHighlight = revealActive
              ? i === answerReveal.correctIndex
              : (!isClickable && (localShowAnswer || showAnswer) && i === q.correct);
            const isWrongHighlight = revealActive
              && answerReveal.chosenIndex !== null
              && answerReveal.chosenIndex !== answerReveal.correctIndex
              && i === answerReveal.chosenIndex;
            return (
              <Tag
                key={i}
                className={`question-answer${isCorrectHighlight ? ' question-answer--correct' : ''}${isWrongHighlight ? ' question-answer--wrong' : ''}${img ? ' question-answer--has-image' : ''}${isClickable ? ' question-answer--clickable' : ''}`}
                {...(isClickable ? { onClick: () => emitJudgeAnswer(socket, winner, i, q.correct, q.scoring !== undefined ? Number(q.scoring) : pointsStake, q.penalty !== undefined ? Number(q.penalty) : undefined) } : {})}
              >
                <span className="answer-prefix">{String.fromCharCode(65 + i)}</span>
                {img && <QuizImage src={img} className="answer-img" />}
                {txt && <span className="answer-text">{txt}</span>}
              </Tag>
            );
          })}
        </div>
      ) : gameMode === 'quiz' && q.mode !== 'text' && !(q.pretext && !showQuestion) && q.answer != null ? (
        <div className={`question-free-answer${(localShowAnswer || showAnswer) ? ' question-free-answer--visible' : ''}`}>
          {(localShowAnswer || showAnswer) ? <>{q.answer && <span>{q.answer}</span>}<QuizImage src={q.answerImage} /></> : '???'}
        </div>
      ) : null}

      {gameMode === 'quiz' && !DISPLAY_ONLY_MODES.has(q.mode) && (
        <div className="reveal-btns">
          {IS_CONTROL && q.pretext && !showQuestion && !winner && (
            <button className="btn btn--accent btn--stretch" onClick={() => { socket.emit('setShowQuestion', { show: true }); emitLoopControl(socket, questions[questionIndex]?.loop ?? 3); }}>
              <Eye size={13} /> {t('show_question')}
            </button>
          )}
          {(!q.pretext || showQuestion) && IS_MASTER && (
            <>
              <button className="btn btn--accent btn--stretch" onClick={() => setLocalShowAnswer(s => !s)}>
                {localShowAnswer ? <><EyeOff size={13} /> {t('hide_me')}</> : <><Eye size={13} /> {t('show_me')}</>}
              </button>
              {q.answers && (
                <button className="btn btn--accent btn--stretch" onClick={() => socket.emit('setShowAnswersOnly', { show: !showAnswersOnly })}>
                  {showAnswersOnly ? <><EyeOff size={13} /> {t('hide_options')}</> : <><Eye size={13} /> {t('show_options')}</>}
                </button>
              )}
              <button className="btn btn--accent btn--stretch" onClick={() => socket.emit('setShowAnswer', { show: !showAnswer })}>
                {showAnswer ? <><EyeOff size={13} /> {t('hide_correct')}</> : <><Megaphone size={13} /> {t('reveal_correct')}</>}
              </button>
            </>
          )}
          {(!q.pretext || showQuestion) && IS_MODERATOR && !winner && q.answers && !showAnswersOnly && (
                <button className="btn btn--accent btn--stretch" onClick={() => { socket.emit('setShowAnswersOnly', { show: true }); emitLoopControl(socket, questions[questionIndex]?.loop ?? 1); }}>
              <Eye size={13} /> {t('show_answers_mod')}
            </button>
          )}
        </div>
      )}

      {(gameMode === 'quiz' || gameMode === 'hint') && !DISPLAY_ONLY_MODES.has(q.mode) && winner && !verdict && (
        IS_MODERATOR ? (
          <div className="judge-controls judge-controls--inline">
            {q.answers ? (
              <div className="moderator-freeanswer-grid">
                <button className="btn btn--error" onClick={() => emitJudgeAnswer(socket, winner, null, q.correct, q.scoring !== undefined ? Number(q.scoring) : pointsStake, q.penalty !== undefined ? Number(q.penalty) : undefined)}>
                  <XCircle size={14} /> {t('judge_too_late')}
                </button>
                <button className="btn btn--ghost" onClick={() => socket.emit('manualReset')}><RotateCcw size={14} /> {t('reset_manual')}</button>
              </div>
            ) : (
              <div className="moderator-freeanswer-grid">
                {Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length > 0 && (
                  <AnswerValidator acceptedAnswers={q.acceptedAnswers} fuzzyMatch={!!q.fuzzyMatch} t={t} />
                )}
                <button className="btn btn--accent btn--stretch" onClick={() => socket.emit('setShowAnswer', { show: true })} style={showAnswer ? { display: 'none' } : {}}>
                  <Eye size={14} /> {t('show_answers_mod')}
                </button>
                <button className="btn btn--error btn--stretch"   onClick={() => useGameStore.getState().judgeAnswer('wrong')}><XCircle size={14} /> {t('judge_wrong')}</button>
                <button className="btn btn--success btn--stretch" onClick={() => useGameStore.getState().judgeAnswer('correct')}><CheckCircle2 size={14} /> {t('judge_correct')}</button>
                <button className="btn btn--ghost btn--stretch" onClick={() => socket.emit('manualReset')}><RotateCcw size={14} /> {t('reset_manual')}</button>
              </div>
            )}
          </div>
        ) : (
          <div className="judge-controls judge-controls--inline">
            <div className="points-row">
              <label className="points-label">{t('points_label_pm')}</label>
              <input
                className="points-input"
                type="number"
                min="0"
                value={pointsStake}
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value));
                  useGameStore.setState({ pointsStake: v });
                  socket.emit('setPoints', { points: v });
                }}
              />
            </div>
            <div className="verdict-btns">
              <button className="btn btn--success" onClick={() => useGameStore.getState().judgeAnswer('correct')}><CheckCircle2 size={18} /> {t('judge_correct')}</button>
              <button className="btn btn--error"   onClick={() => useGameStore.getState().judgeAnswer('wrong')}><XCircle size={18} /> {t('judge_wrong')}</button>
            </div>
            <button className="btn btn--ghost" onClick={() => socket.emit('manualReset')} style={{ marginTop: '0.5rem' }}><RotateCcw size={14} /> {t('reset_skip')}</button>
          </div>
        )
      )}

      {IS_CONTROL && (gameMode === 'quiz' || gameMode === 'hint') && winner && verdict && (
        <div className="judge-controls judge-controls--inline" style={{ marginTop: '0.5rem' }}>
          <button
            className={`btn btn--ghost btn--stretch undo-btn${undoProgress ? ' undo-btn--active' : ''}`}
            onPointerDown={onUndoDown}
            onPointerUp={onUndoUp}
            onPointerLeave={onUndoUp}
          >
            <Undo2 size={14} /> {t('undo_last') ?? 'Hold to undo'}
          </button>
        </div>
      )}

      {gameMode === 'hint' && q.mode === 'hint' && Array.isArray(q.hints) && (
        <div className="hint-controls">
          <div className="hint-moderator-list">
            {q.hints.map((h, i) => (
              <div key={i} className={`hint-mod-item${i <= hintIndex ? ' hint-mod-item--revealed' : ''}`}>
                <span className="hint-num">{i + 1}</span>
                <span className="hint-text">{h}</span>
                {Array.isArray(q.scoring) && <span className="hint-pts">{q.scoring[i]} pts</span>}
              </div>
            ))}
          </div>
          {!winner && (
            <div className="reveal-btns" style={{ marginTop: '0.5rem' }}>
              {!showQuestion && (
                <button className="btn btn--accent btn--stretch" onClick={() => socket.emit('setShowQuestion', { show: true })}>
                  <Eye size={13} /> {t('show_question')}
                </button>
              )}
              {showQuestion && hintIndex < q.hints.length - 1 && (
                <button className="btn btn--accent btn--stretch" onClick={() => socket.emit('nextHint')}>
                  <Lightbulb size={13} /> {t('next_hint')} ({hintIndex + 2}/{q.hints.length})
                </button>
              )}
              {showQuestion && (
                <button className="btn btn--accent btn--stretch" onClick={() => socket.emit('setShowAnswer', { show: !showAnswer })}>
                  {showAnswer ? <><EyeOff size={13} /> {t('hide_correct')}</> : <><Megaphone size={13} /> {t('reveal_correct')}</>}
                </button>
              )}
            </div>
          )}
          {lockedOutIds.length > 0 && (
            <div className="hint-lockouts">
              {lockedOutIds.map(id => (
                <span key={id} className="hint-lockout-chip">{nameMap[id] || id}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {gameMode === 'timer' && (
        <div className="reveal-btns">
          <button className="btn btn--accent btn--stretch" onClick={() => socket.emit('startTimer', { scoringType: currentQ?.scoringType ?? 'fastest', duration: currentQ?.duration })}>
            <Timer size={13} /> {t('start_timer_round')}{currentQ?.duration ? ` (${currentQ.duration}s)` : ''}
          </button>
        </div>
      )}
      {gameMode === 'itimer' && iterPhase === 'idle' && (
        <div className="reveal-btns">
          <button
            className="btn btn--accent btn--stretch"
            onClick={() => {
              socket.emit('startIter', { scoringType: currentQ?.scoringType ?? 'fastest', duration: currentQ?.duration });
            }}
          >
            <Hourglass size={13} /> {t('start_iter_round')}{currentQ?.duration ? ` (${currentQ.duration}s)` : ''}
          </button>
        </div>
      )}
    </div>
  );
}

/** Inline answer validator: moderator types what they heard, system shows match feedback */
function AnswerValidator({ acceptedAnswers, fuzzyMatch, t }) {
  const [typed, setTyped] = useState('');
  const result = typed.trim() ? checkAnswer(typed, acceptedAnswers, fuzzyMatch) : null;
  return (
    <div className="answer-validator">
      <input
        type="text"
        className="answer-validator__input"
        placeholder={t('validator_placeholder')}
        value={typed}
        onChange={e => setTyped(e.target.value)}
        autoFocus
      />
      {result && (
        <span className={`answer-validator__badge${result.match ? ' answer-validator__badge--match' : ' answer-validator__badge--no-match'}`}>
          {result.match
            ? (result.distance === 0 ? `\u2714 ${result.bestMatch}` : `\u2248 ${result.bestMatch} (${result.distance})`)
            : `\u2718 ${result.bestMatch ? `${t('validator_closest')}: ${result.bestMatch}` : t('validator_no_match')}`
          }
        </span>
      )}
    </div>
  );
}
