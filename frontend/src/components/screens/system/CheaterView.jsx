import { useEffect, useState } from 'react';
import '../../../App.css';

const answerText  = (a) => (typeof a === 'string' ? a : (a?.text ?? ''));
const answerImage = (a) => (typeof a === 'string' ? null : (a?.image?.trim() || null));

const NON_PLAYABLE = new Set(['intro', 'rules', 'text']);

export default function CheaterView() {
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    fetch('/questions.json')
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setQuestions(data); })
      .catch(() => {});
  }, []);

  return (
    <div className="cheater-wrap">
      <table className="cheater-table">
        <tbody>
          {questions.map((q, i) => {
            const hasAnswers = Array.isArray(q.answers) && q.answers.length > 0;
            const hasFreeAnswer = q.answer != null;
            const dim = NON_PLAYABLE.has(q.mode);

            return (
              <tr key={i} className={`cheater-row${dim ? ' cheater-row--dim' : ''}`}>
                <td className="cheater-num">{i + 1}</td>

                <td className="cheater-question">
                  {q.questionImage && (
                    <img src={q.questionImage} className="cheater-qimg" alt="" />
                  )}
                  <span>{q.question}</span>
                </td>

                <td className="cheater-answer">
                  {hasAnswers && q.answers.map((a, ai) => {
                    const txt = answerText(a);
                    const img = answerImage(a);
                    const correct = ai === q.correct;
                    return (
                      <span key={ai} className={`cheater-opt${correct ? ' cheater-opt--correct' : ''}`}>
                        {img
                          ? <img src={img} className="cheater-aimg" alt={correct ? '✓' : ''} />
                          : (txt || '?')}
                      </span>
                    );
                  })}

                  {!hasAnswers && hasFreeAnswer && (
                    <span className="cheater-opt cheater-opt--correct">{q.answer}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
