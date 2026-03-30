/**
 * QuestionList — Accordion list of questions with inline editing.
 *
 * Props:
 *   rows, openIdx, onToggle, onUpdate, onMoveUp, onMoveDown, onDelete, onAdd,
 *   loops, loopNames, videos (optional, [] for standalone),
 *   onUploadImage — async (file) => storedPath,
 *   resolveUrl    — (path) => displayableURL (default: identity),
 *   editingSet    — current set name (for video paths),
 *   modes         — array of mode strings to show in dropdown,
 *   t             — i18n function
 */
import { SUPPORTED_LANGS, THEMES, SCOREBOARD_POSITIONS } from '../../../../utils/config';
import { MODE_LABELS } from './questionUtils';
import ImageInput from './ImageInput';

export default function QuestionList({
  rows, openIdx, onToggle, onUpdate, onMoveUp, onMoveDown, onDelete, onAdd,
  loops, loopNames, videos = [], onUploadImage, resolveUrl,
  editingSet, modes, t,
}) {
  return (
    <>
      <div className="qe-list">
        {rows.map((row, idx) => {
          const isOpen = openIdx === idx;
          const preview = row.mode === 'config'
            ? [row.configLang, row.configTheme, row.configScoreboardPos].filter(Boolean).join(', ') || t('qe_preview_empty')
            : row.mode === 'video'
            ? row.question.trim() || row.video?.trim() || t('qe_preview_empty')
            : row.question.trim() || t('qe_preview_empty');
          return (
          <div key={idx} className={`qe-row${isOpen ? ' qe-row--open' : ''}`}>
            {/* ── Accordion header (always visible) ── */}
            <div className="qe-row-header" onClick={() => onToggle(idx)} style={{ cursor: 'pointer' }}>
              <span className="qe-row-num">#{idx + 1}</span>
              <span className={`qe-row-mode-badge qe-row-mode-badge--${row.mode}`}>{MODE_LABELS[row.mode] ?? row.mode}</span>
              {row.mode === 'quiz' && <span className="qe-row-variant-badge">{row.answerType === 'free' ? 'single' : 'multi'}</span>}
              {row.mode === 'itimer' && <span className="qe-row-variant-badge">{row.scoringType ?? 'fastest'}</span>}
              {row.mode === 'timer' && <span className="qe-row-variant-badge">{row.scoringType ?? 'fastest'}</span>}
              {!isOpen && <span className="qe-row-preview">{preview}</span>}
              <div className="qe-row-actions" onClick={e => e.stopPropagation()}>
                <button className="qe-icon-btn" onClick={() => onMoveUp(idx)}   disabled={idx === 0}            title="Move up">{'\u25B2'}</button>
                <button className="qe-icon-btn" onClick={() => onMoveDown(idx)} disabled={idx === rows.length - 1} title="Move down">{'\u25BC'}</button>
                <button className="qe-icon-btn qe-delete" onClick={() => onDelete(idx)} title="Delete">{'\uD83D\uDDD1'}</button>
              </div>
              <span className="qe-chevron">{isOpen ? '\u25BE' : '\u25B8'}</span>
            </div>

            {/* ── Expanded body ── */}
            {isOpen && (<>

            {/* ── Mode / answer-type selectors ── */}
            <div className="qe-body-selects">
              <select
                className="qe-select"
                value={row.mode}
                onClick={e => e.stopPropagation()}
                onChange={e => {
                  const mode = e.target.value;
                  const noAnswerModes = ['timer', 'text', 'itimer', 'config', 'video', 'hint', 'chain', 'estimate', 'standings'];
                  const answerType = noAnswerModes.includes(mode) ? 'none' : row.answerType === 'none' ? 'multiple' : row.answerType;
                  onUpdate(idx, { mode, answerType });
                }}
              >
                {modes.map(m => <option key={m} value={m}>{MODE_LABELS[m] ?? m}</option>)}
              </select>
              {row.mode === 'quiz' && (
                <select
                  className="qe-select"
                  value={row.answerType}
                  onClick={e => e.stopPropagation()}
                  onChange={e => onUpdate(idx, { answerType: e.target.value })}
                >
                  <option value="multiple">{t('qe_mode_multiple')}</option>
                  <option value="free">{t('qe_mode_free')}</option>
                </select>
              )}
              {row.mode === 'itimer' && (
                <select
                  className="qe-select"
                  value={row.scoringType ?? 'fastest'}
                  onClick={e => e.stopPropagation()}
                  onChange={e => onUpdate(idx, { scoringType: e.target.value })}
                >
                  <option value="fastest">{t('qe_scoring_fastest')}</option>
                  <option value="longest">{t('qe_scoring_longest')}</option>
                  <option value="amount">{t('qe_scoring_amount')}</option>
                </select>
              )}
              {row.mode === 'timer' && (
                <select
                  className="qe-select"
                  value={row.scoringType ?? 'fastest'}
                  onClick={e => e.stopPropagation()}
                  onChange={e => onUpdate(idx, { scoringType: e.target.value })}
                >
                  <option value="fastest">{t('qe_scoring_fastest')}</option>
                  <option value="longest">{t('qe_scoring_longest')}</option>
                </select>
              )}
              {(row.mode === 'timer' || row.mode === 'itimer') && (
                <input
                  type="number" min="0" step="1"
                  className="qe-duration-input"
                  placeholder={t('qe_duration_placeholder')}
                  value={row.duration ?? ''}
                  onClick={e => e.stopPropagation()}
                  onChange={e => onUpdate(idx, { duration: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              )}
            </div>

            {/* ── Chapter label (any mode) ── */}
            <input
              type="text"
              className="qe-free-input qe-chapter-input"
              placeholder={t('qe_chapter_placeholder')}
              value={row.chapter ?? ''}
              onChange={e => onUpdate(idx, { chapter: e.target.value || undefined })}
            />

            {/* ── Pretext (quiz + free only) ── */}
            {row.mode === 'quiz' && row.answerType === 'free' && (
              <input
                type="text"
                className="qe-free-input qe-pretext-input"
                placeholder={t('qe_pretext_placeholder')}
                value={row.pretext ?? ''}
                onChange={e => onUpdate(idx, { pretext: e.target.value })}
              />
            )}

            {/* ── Hint mode editor ── */}
            {row.mode === 'hint' && (<>
              <div className="qe-hints-list">
                {(row.hints || []).map((h, hi) => (
                  <div key={hi} className="qe-hint-row">
                    <span className="hint-num">{hi + 1}</span>
                    <input
                      type="text" className="qe-free-input"
                      placeholder={`Hint ${hi + 1}…`}
                      value={h}
                      onChange={e => {
                        const next = [...(row.hints || [])];
                        next[hi] = e.target.value;
                        onUpdate(idx, { hints: next });
                      }}
                    />
                    <input
                      type="number" className="qe-duration-input" placeholder="pts"
                      value={(row.hintScoring || [])[hi] ?? ''}
                      onChange={e => {
                        const next = [...(row.hintScoring || [])];
                        next[hi] = e.target.value === '' ? 0 : Number(e.target.value);
                        onUpdate(idx, { hintScoring: next });
                      }}
                    />
                    {(row.hints || []).length > 1 && (
                      <button className="qe-hint-remove" onClick={() => {
                        const nh = [...(row.hints || [])]; nh.splice(hi, 1);
                        const ns = [...(row.hintScoring || [])]; ns.splice(hi, 1);
                        onUpdate(idx, { hints: nh, hintScoring: ns });
                      }}>&times;</button>
                    )}
                  </div>
                ))}
                <button className="qe-hint-add" onClick={() => {
                  onUpdate(idx, {
                    hints: [...(row.hints || []), ''],
                    hintScoring: [...(row.hintScoring || []), 20],
                  });
                }}>+ Add hint</button>
              </div>
              <input type="text" className="qe-free-input" style={{ margin: '0.3rem 1.25rem 0' }}
                placeholder="Answer…" value={row.freeAnswer ?? ''}
                onChange={e => onUpdate(idx, { freeAnswer: e.target.value })}
              />
              <div className="qe-scoring-row">
                <input type="number" step="1" className="qe-duration-input"
                  placeholder={t('qe_penalty_placeholder')} value={row.penalty ?? ''}
                  onClick={e => e.stopPropagation()}
                  onChange={e => onUpdate(idx, { penalty: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              </div>
            </>)}

            {/* ── Mode-specific body ── */}
            {row.mode === 'config' ? (
              <div className="qe-config-card">
                <p className="qe-config-hint">{t('qe_config_hint')}</p>
                <div className="qe-config-fields">
                  <label className="qe-config-label">{t('qe_config_lang')}</label>
                  <select className="qe-select" value={row.configLang} onChange={e => onUpdate(idx, { configLang: e.target.value })} onClick={e => e.stopPropagation()}>
                    <option value="">{'\u2014'} {t('qe_config_none')} {'\u2014'}</option>
                    {SUPPORTED_LANGS.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <label className="qe-config-label">{t('qe_config_theme')}</label>
                  <select className="qe-select" value={row.configTheme} onChange={e => onUpdate(idx, { configTheme: e.target.value })} onClick={e => e.stopPropagation()}>
                    <option value="">{'\u2014'} {t('qe_config_none')} {'\u2014'}</option>
                    {THEMES.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <label className="qe-config-label">{t('qe_config_scoreboard')}</label>
                  <select className="qe-select" value={row.configScoreboardPos} onChange={e => onUpdate(idx, { configScoreboardPos: e.target.value })} onClick={e => e.stopPropagation()}>
                    <option value="">{'\u2014'} {t('qe_config_none')} {'\u2014'}</option>
                    {SCOREBOARD_POSITIONS.map(({ value, labelKey }) => (
                      <option key={value} value={value}>{t(labelKey)}</option>
                    ))}
                  </select>
                  <label className="qe-config-label">{t('qe_config_teams')}</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <input type="checkbox" checked={!!row.configTeamShuffle} onChange={e => onUpdate(idx, { configTeamShuffle: e.target.checked })} />
                      {t('qe_config_team_shuffle')}
                    </label>
                    <input type="number" min="2" max="8" className="qe-duration-input" style={{ width: '4rem' }}
                      placeholder="4" value={row.configTeamCount ?? ''} onClick={e => e.stopPropagation()}
                      onChange={e => onUpdate(idx, { configTeamCount: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
            ) : row.mode === 'video' ? (
              <>
                <textarea
                  className="qe-question-input"
                  rows={1}
                  placeholder={t('qe_video_title_placeholder')}
                  value={row.question}
                  onChange={e => onUpdate(idx, { question: e.target.value })}
                />
                {videos.length > 0 && (
                  <select
                    className="qe-select"
                    value={row.video ?? ''}
                    onClick={e => e.stopPropagation()}
                    onChange={e => onUpdate(idx, { video: e.target.value })}
                  >
                    <option value="">{t('qe_video_select')}</option>
                    {videos.map(f => (
                      <option key={f} value={`/uploads/packs/${encodeURIComponent(editingSet)}/questions/videos/${encodeURIComponent(f)}`}>{f}</option>
                    ))}
                  </select>
                )}
                <input
                  type="url"
                  className="qe-image-input"
                  placeholder={t('qe_video_url_placeholder')}
                  value={row.video ?? ''}
                  onChange={e => onUpdate(idx, { video: e.target.value })}
                />
                {row.video?.trim() && (
                  <video src={resolveUrl ? resolveUrl(row.video) : row.video} className="qe-video-preview" controls preload="metadata" />
                )}
              </>
            ) : (
              <>
                <textarea
                  className="qe-question-input"
                  rows={2}
                  placeholder={t('qe_question_placeholder')}
                  value={row.question}
                  onChange={e => onUpdate(idx, { question: e.target.value })}
                />
                <div className="qe-img-pos-row">
                  <ImageInput
                    placeholder={t('qe_img_question')}
                    value={row.questionImage ?? ''}
                    onChange={v => onUpdate(idx, { questionImage: v })}
                    onUpload={onUploadImage}
                    resolveUrl={resolveUrl}
                  />
                  {row.questionImage?.trim() && (
                    <select
                      className="qe-select"
                      value={row.questionImagePosition ?? ''}
                      onClick={e => e.stopPropagation()}
                      onChange={e => onUpdate(idx, { questionImagePosition: e.target.value || undefined })}
                    >
                      <option value="">{t('qe_img_pos_above')}</option>
                      <option value="right">{t('qe_img_pos_right')}</option>
                      <option value="below">{t('qe_img_pos_below')}</option>
                      <option value="fullscreen">{t('qe_img_pos_fullscreen')}</option>
                      <option value="background">{t('qe_img_pos_background')}</option>
                    </select>
                  )}
                </div>
              </>
            )}

            {/* ── Loop selector (modes that play music) ── */}
            {['quiz', 'timer', 'itimer'].includes(row.mode) && loops.length > 0 && (
              <select
                className="qe-select qe-select--loop"
                value={row.loop ?? ''}
                onClick={e => e.stopPropagation()}
                onChange={e => onUpdate(idx, { loop: e.target.value })}
                title="Music loop to play for this round"
              >
                <option value="">{t('qe_loop_default')}</option>
                {loops.map(n => <option key={n} value={n}>{'\uD83C\uDFB5'} {loopNames[n] || `Loop ${n}`}</option>)}
              </select>
            )}

            {/* ── Answer fields ── */}
            {row.mode === 'quiz' && row.answerType === 'multiple' && (
              <div className="qe-choices">
                {row.answers.map((ans, ai) => (
                  <div key={ai} className="qe-choice">
                    <input
                      type="radio"
                      name={`correct-${idx}`}
                      checked={row.correct === ai}
                      onChange={() => onUpdate(idx, { correct: ai })}
                      title="Mark as correct answer"
                    />
                    <input
                      type="text"
                      className="qe-choice-input"
                      placeholder={`Option ${String.fromCharCode(65 + ai)}`}
                      value={ans.text ?? ''}
                      onChange={e => {
                        const answers = [...row.answers];
                        answers[ai] = { ...ans, text: e.target.value };
                        onUpdate(idx, { answers });
                      }}
                    />
                    <ImageInput
                      placeholder={t('qe_img_option', String.fromCharCode(65 + ai))}
                      value={ans.image ?? ''}
                      onChange={v => {
                        const answers = [...row.answers];
                        answers[ai] = { ...ans, image: v };
                        onUpdate(idx, { answers });
                      }}
                      onUpload={onUploadImage}
                      resolveUrl={resolveUrl}
                      compact
                    />
                  </div>
                ))}
                <div className="qe-correct-hint">{t('qe_correct_hint')}</div>
              </div>
            )}

            {row.mode === 'quiz' && row.answerType === 'free' && (
              <>
                <input
                  type="text"
                  className="qe-free-input"
                  value={row.freeAnswer}
                  onChange={e => onUpdate(idx, { freeAnswer: e.target.value })}
                />
                <ImageInput
                  placeholder={t('qe_img_answer')}
                  value={row.answerImage ?? ''}
                  onChange={v => onUpdate(idx, { answerImage: v })}
                  onUpload={onUploadImage}
                  resolveUrl={resolveUrl}
                />
              </>
            )}
            {/* ── Scoring / Penalty (quiz only) ── */}
            {row.mode === 'quiz' && (
              <div className="qe-scoring-row">
                <input
                  type="number" step="1"
                  className="qe-duration-input"
                  placeholder={t('qe_scoring_placeholder')}
                  value={row.scoring ?? ''}
                  onClick={e => e.stopPropagation()}
                  onChange={e => onUpdate(idx, { scoring: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
                <input
                  type="number" step="1"
                  className="qe-duration-input"
                  placeholder={t('qe_penalty_placeholder')}
                  value={row.penalty ?? ''}
                  onClick={e => e.stopPropagation()}
                  onChange={e => onUpdate(idx, { penalty: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              </div>
            )}
            {/* ── Accepted Answers + Fuzzy Match (quiz free-text) ── */}
            {row.mode === 'quiz' && row.answerType === 'free' && (
              <div className="qe-scoring-row" style={{ alignItems: 'center' }}>
                <input
                  type="text"
                  className="qe-free-input"
                  style={{ flex: 1 }}
                  placeholder={t('qe_accepted_answers')}
                  value={row.acceptedAnswers ?? ''}
                  onChange={e => onUpdate(idx, { acceptedAnswers: e.target.value })}
                />
                <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.5)' }}>
                  <input type="checkbox" checked={!!row.fuzzyMatch} onChange={e => onUpdate(idx, { fuzzyMatch: e.target.checked })} />
                  {t('qe_fuzzy_match')}
                </label>
              </div>
            )}
            </>)}
          </div>
          );
        })}
      </div>

      <button className="qe-add-btn" onClick={onAdd}>{t('qe_add_question')}</button>
    </>
  );
}
