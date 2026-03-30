/**
 * questionUtils.js — Shared constants and row↔question conversion utilities.
 */

export const MODES        = ['intro', 'rules', 'text', 'video', 'config', 'standings', 'quiz', 'hint', 'timer', 'itimer', 'chain', 'estimate'];
export const MODES_NO_VIDEO = ['intro', 'rules', 'text', 'config', 'standings', 'quiz', 'hint', 'timer', 'itimer', 'chain', 'estimate'];
export const MODE_LABELS  = { intro: 'intro', rules: 'rules', text: 'text', video: 'video', config: 'config', standings: 'standings', quiz: 'quiz', hint: 'hint', timer: 'timer', itimer: 'I-Timer', chain: 'chain', estimate: 'estimate' };
export const ANSWER_TYPES = ['multiple', 'free', 'none'];

export function questionToRow(q) {
  let answerType = 'none';
  if (Array.isArray(q.answers))       answerType = 'multiple';
  else if (q.answer !== undefined)    answerType = 'free';

  return {
    mode:          q.mode ?? 'quiz',
    chapter:       q.chapter ?? '',
    question:      q.question ?? '',
    questionImage: q.questionImage ?? '',
    questionImagePosition: q.questionImagePosition ?? '',
    video:         q.video ?? '',
    pretext:       q.pretext ?? '',
    answerType,
    scoringType:   q.scoringType ?? 'fastest',
    duration:      q.duration ?? '',
    loop:          q.loop ?? '',
    configLang:         q.lang          ?? '',
    configTheme:        q.theme         ?? '',
    configScoreboardPos: q.scoreboardPos ?? '',
    configTeamCount:    q.teams?.count  ?? '',
    configTeamShuffle:  !!q.teams?.shuffle,
    configTopN:         q.scoreboard?.topN ?? '',
    configShowGaps:     !!q.scoreboard?.showGaps,
    answers: Array.isArray(q.answers)
      ? q.answers.map(a => typeof a === 'string' ? { text: a, image: '' } : { text: a.text ?? '', image: a.image ?? '' })
      : [{ text: '', image: '' }, { text: '', image: '' }, { text: '', image: '' }, { text: '', image: '' }],
    correct:     q.correct ?? 0,
    freeAnswer:  q.answer ?? '',
    answerImage: q.answerImage ?? '',
    scoring:     q.scoring ?? '',
    penalty:     q.penalty ?? '',
    acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers.join(', ') : '',
    fuzzyMatch:  !!q.fuzzyMatch,
    // Hint mode
    hints:        Array.isArray(q.hints) ? q.hints : ['', '', '', '', ''],
    hintScoring:  Array.isArray(q.scoring) && q.mode === 'hint' ? q.scoring : [80, 65, 50, 35, 20],
  };
}

export function rowToQuestion(row) {
  if (row.mode === 'config') {
    const q = { mode: 'config' };
    if (row.chapter?.trim())             q.chapter       = row.chapter.trim();
    if (row.configLang?.trim())          q.lang          = row.configLang.trim();
    if (row.configTheme?.trim())         q.theme         = row.configTheme.trim();
    if (row.configScoreboardPos?.trim()) q.scoreboardPos = row.configScoreboardPos.trim();
    if (row.configTopN || row.configShowGaps) {
      q.scoreboard = {};
      if (row.configTopN) q.scoreboard.topN = Number(row.configTopN);
      if (row.configShowGaps) q.scoreboard.showGaps = true;
    }
    if (row.configTeamCount || row.configTeamShuffle) {
      q.teams = {};
      if (row.configTeamCount) q.teams.count = Number(row.configTeamCount);
      if (row.configTeamShuffle) q.teams.shuffle = true;
      q.teams.display = true;
    }
    return q;
  }
  const q = { mode: row.mode, question: row.question.trim() };
  if (row.chapter?.trim()) q.chapter = row.chapter.trim();
  if (row.questionImage?.trim()) q.questionImage = row.questionImage.trim();
  if (row.questionImagePosition?.trim()) q.questionImagePosition = row.questionImagePosition.trim();
  if (row.video?.trim()) q.video = row.video.trim();
  if (row.loop !== '' && row.loop !== undefined) q.loop = Number(row.loop);
  if (row.mode === 'itimer' || row.mode === 'timer') {
    q.scoringType = row.scoringType ?? 'fastest';
    if (row.duration !== '' && row.duration !== undefined) q.duration = Number(row.duration);
  }
  if (row.mode === 'quiz') {
    if (row.pretext?.trim()) q.pretext = row.pretext.trim();
    if (row.answerType === 'multiple') {
      q.answers = row.answers.map(a => {
        const text  = (a.text  ?? '').trim();
        const image = (a.image ?? '').trim();
        if (image && text)  return { text, image };
        if (image)          return { image };
        return text;
      });
      q.correct = row.correct;
    } else if (row.answerType === 'free') {
      q.answer = row.freeAnswer.trim();
      if (row.answerImage?.trim()) q.answerImage = row.answerImage.trim();
    }
  }
  if (row.mode === 'quiz') {
    if (row.scoring !== '' && row.scoring !== undefined) q.scoring = Number(row.scoring);
    if (row.penalty !== '' && row.penalty !== undefined) q.penalty = Number(row.penalty);
    if (row.acceptedAnswers?.trim()) q.acceptedAnswers = row.acceptedAnswers.split(',').map(s => s.trim()).filter(Boolean);
    if (row.fuzzyMatch) q.fuzzyMatch = true;
  }
  if (row.mode === 'hint') {
    q.hints = (row.hints || []).filter(h => h.trim());
    q.answer = (row.freeAnswer || '').trim();
    if (row.answerImage?.trim()) q.answerImage = row.answerImage.trim();
    q.scoring = (row.hintScoring || []).map(Number).filter(n => !isNaN(n));
    if (row.penalty !== '' && row.penalty !== undefined) q.penalty = Number(row.penalty);
  }
  return q;
}

export function makeEmptyRow() {
  return {
    mode: 'quiz', chapter: '', question: '', questionImage: '', questionImagePosition: '', video: '', pretext: '',
    answerType: 'multiple', scoringType: 'fastest', duration: '', loop: '',
    answers: [{ text: '', image: '' }, { text: '', image: '' }, { text: '', image: '' }, { text: '', image: '' }],
    correct: 0, freeAnswer: '', answerImage: '',
    scoring: '', penalty: '',
    acceptedAnswers: '', fuzzyMatch: false,
  };
}
