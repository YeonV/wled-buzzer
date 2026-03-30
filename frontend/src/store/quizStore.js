import { create } from 'zustand';
import socket from '../services/socket';
import { DISPLAY_ONLY_MODES } from '../utils/questions';
import { emitSetQuestionIndex } from '../services/socketActions';
import { fetchQuestions, fetchQuestionSets } from '../services/api';
import { BACKEND_URL, IS_CONTROL } from '../utils/viewMode';

export const useQuizStore = create((set, get) => ({
  questions:       [],
  questionIndex:   0,
  showQuestion:    false,
  showAnswer:      false,
  showAnswersOnly: false,
  localShowAnswer: false,
  answerReveal:    { chosenIndex: null, correctIndex: null },
  activeSet:       null,
  questionSets:    [],

  // ── Derived helpers (called in render, not stored) ───────────────────
  getVisibleIndices() {
    return get().questions.reduce((acc, q, i) => {
      if (q.mode !== 'config') acc.push(i);
      return acc;
    }, []);
  },

  getCurrentQ() {
    const { questions, questionIndex } = get();
    return questions[questionIndex] ?? null;
  },

  // ── Actions ──────────────────────────────────────────────────────────
  navTo(i) {
    const { questions } = get();
    const m = questions[i]?.mode;
    emitSetQuestionIndex(socket, i, !DISPLAY_ONLY_MODES.has(m) ? m : undefined);
  },

  setLocalShowAnswer(v) {
    set({ localShowAnswer: typeof v === 'function' ? v(get().localShowAnswer) : v });
  },

  // ── Data fetching ─────────────────────────────────────────────────────
  async fetchQuestions() {
    const data = await fetchQuestions().catch(() => []);
    if (data.length > 0) set({ questions: data });
  },

  async fetchQuestionSets() {
    const { sets, active } = await fetchQuestionSets(BACKEND_URL).catch(() => ({}));
    set({ questionSets: sets ?? [], activeSet: active ?? null });
  },

  // ── Socket handlers (called from socketBridge.js) ────────────────────
  onQuestionIndex(d, stopLoop) {
    stopLoop();
    set({
      questionIndex:   d.index,
      showQuestion:    false,
      localShowAnswer: false,
      showAnswersOnly: false,
      answerReveal:    { chosenIndex: null, correctIndex: null },
    });
  },

  onShowQuestion(d)    { set({ showQuestion: d.show }); },

  onShowAnswer(d) {
    set({
      showAnswer: d.show,
      ...(d.show  ? { showAnswersOnly: false } : {}),
      ...(!d.show ? { localShowAnswer: false } : {}),
    });
  },

  onShowAnswersOnly(d) {
    set({ showAnswersOnly: d.show, ...(d.show ? { showAnswer: false } : {}) });
  },

  onAnswerReveal(d) { set({ answerReveal: d }); },

  onQuestionsUpdated()   { get().fetchQuestions(); },
  onActiveSetChanged({ name }) {
    set({ activeSet: name ?? null });
    get().fetchQuestionSets();
  },
}));

// Auto-apply config-slide settings and skip past them (IS_CONTROL only)
useQuizStore.subscribe((state, prev) => {
  if (state.questionIndex === prev.questionIndex && state.questions === prev.questions) return;
  const { questionIndex, questions } = state;
  const q = questions[questionIndex];
  if (!q || q.mode !== 'config') return;
  if (q.lang)          socket.emit('setLang',          { lang:  q.lang });
  if (q.theme)         socket.emit('setTheme',         { theme: q.theme });
  if (q.scoreboardPos) socket.emit('setScoreboardPos', { pos:   q.scoreboardPos });
  if (q.scoreboard) {
    if (q.scoreboard.topN !== undefined) socket.emit('setScoreboardTopN', { topN: q.scoreboard.topN });
    if (q.scoreboard.showGaps !== undefined) socket.emit('setScoreboardShowGaps', { showGaps: q.scoreboard.showGaps });
    if (q.scoreboard.show === 'individual') socket.emit('clearTeams');
  }
  if (q.teams) {
    if (q.teams.shuffle) socket.emit('shuffleTeams', { count: q.teams.count ?? 4, names: q.teams.names });
    else socket.emit('setTeamMode', { active: !!q.teams.display });
  }
  if (!IS_CONTROL) return;
  const next = questions.findIndex((qq, i) => i > questionIndex && qq.mode !== 'config');
  if (next !== -1) emitSetQuestionIndex(socket, next, !DISPLAY_ONLY_MODES.has(questions[next]?.mode) ? questions[next]?.mode : undefined);
});
