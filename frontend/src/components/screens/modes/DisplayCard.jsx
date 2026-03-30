import { useQuizStore }  from '../../../store/quizStore';
import { useGameStore }  from '../../../store/gameStore';
import { IS_CONTROL }    from '../../../utils/viewMode';
import { answerText, answerImage } from '../../../utils/questions';
import IntroSlide from './IntroSlide';
import RulesSlide from './RulesSlide';
import QuizImage  from '../../QuizImage';
import { useShallow } from 'zustand/shallow';

// Stable file-level component — avoids remount-on-every-render that occurred
// when DisplayCard was defined as an inline closure inside App.jsx.
export default function DisplayCard() {
  const { showQuestion, showAnswer, showAnswersOnly, answerReveal, getCurrentQ } = useQuizStore(
    useShallow(({ showQuestion, showAnswer, showAnswersOnly, answerReveal, getCurrentQ }) =>
      ({ showQuestion, showAnswer, showAnswersOnly, answerReveal, getCurrentQ }))
  );
  const hintIndex = useGameStore(s => s.hintIndex);
  const currentQ = getCurrentQ();

  if (IS_CONTROL || !currentQ) return null;

  const q = currentQ;

  if (q.mode === 'intro') return <IntroSlide question={q.question} />;
  if (q.mode === 'rules') return <RulesSlide question={q.question} />;
  if (q.mode === 'standings') {
    // Standalone standings slide — rendered by the Scoreboard component
    // The variant (full, topN) is controlled by the config slide before this
    return (
      <div className="standings-slide">
        <div className="standings-title">{q.question || 'Standings'}</div>
      </div>
    );
  }
  if (q.mode === 'video') return (
    <div className="video-slide video-slide--display">
      {q.video && <video src={q.video} className="video-slide__player" autoPlay controls />}
      {q.question && <div className="video-slide__title">{q.question}</div>}
    </div>
  );

  const imgPos = q.questionImagePosition || 'above';

  // ── Hint mode display ───────────────────────────────────────────────
  if (q.mode === 'hint' && Array.isArray(q.hints)) {
    const pointsForHint = Array.isArray(q.scoring) ? (q.scoring[hintIndex] ?? q.scoring[q.scoring.length - 1]) : '?';
    return (
      <div className="question-card question-card--display hint-display">
        {showQuestion && (
          <>
            <div className="question-text">{q.question}</div>
            <QuizImage src={q.questionImage} className="question-img" position={imgPos} />
            <div className="hint-list">
              {q.hints.map((h, i) => (
                i <= hintIndex && <div key={i} className="hint-item" style={{ animationDelay: `${i * 0.08}s` }}>
                  <span className="hint-num">{i + 1}</span>
                  <span className="hint-text">{h}</span>
                </div>
              ))}
            </div>
            <div className="hint-points-badge">{pointsForHint} Pkt</div>
          </>
        )}
        {showAnswer && q.answer && (
          <div className="hint-answer-reveal">
            <span>{q.answer}</span>
            <QuizImage src={q.answerImage} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`question-card question-card--display${imgPos === 'right' ? ' question-card--img-right' : ''}`}>
      {q.pretext && !showQuestion
        ? <div className="question-text question-text--pretext">{q.pretext}</div>
        : <>
            {imgPos !== 'right' && <QuizImage src={q.questionImage} className="question-img" position={imgPos} />}
            {q.question && <div className="question-text">{q.question}</div>}
            {imgPos === 'right' && <QuizImage src={q.questionImage} className="question-img" position={imgPos} />}
          </>
      }
      {!(q.pretext && !showQuestion) && q.answers ? (
        (showAnswer || showAnswersOnly || answerReveal.correctIndex !== null) ? (
          <div className={`question-answers${q.answers.some(a => answerImage(a)) ? ' question-answers--grid' : ''}`}>
            {q.answers.map((a, i) => {
              const txt = answerText(a);
              const img = answerImage(a);
              const isRevealCorrect = answerReveal.correctIndex !== null
                ? i === answerReveal.correctIndex
                : (showAnswer && i === q.correct);
              const isRevealWrong = answerReveal.chosenIndex !== null
                && answerReveal.chosenIndex !== answerReveal.correctIndex
                && i === answerReveal.chosenIndex;
              return (
                <div
                  key={i}
                  className={`question-answer${isRevealCorrect ? ' question-answer--correct' : ''}${isRevealWrong ? ' question-answer--wrong' : ''}${img ? ' question-answer--has-image' : ''}`}
                >
                  <span className="answer-prefix">{String.fromCharCode(65 + i)}</span>
                  {img && <QuizImage src={img} className="answer-img" />}
                  {txt && <span className="answer-text">{txt}</span>}
                </div>
              );
            })}
          </div>
        ) : null
      ) : !(q.pretext && !showQuestion) && q.answer != null ? (
        <div className={`question-free-answer${showAnswer ? ' question-free-answer--visible' : ''}`}>
          {showAnswer ? <>{q.answer && <span>{q.answer}</span>}<QuizImage src={q.answerImage} /></> : '???'}
        </div>
      ) : null}
    </div>
  );
}
