import { create } from 'zustand';
import socket from '../services/socket';
import { useAudioStore } from './audioStore';
import { useSessionStore } from './sessionStore';
import { useQuizStore } from './quizStore';
import { emitLoopControl, emitJudgeCall } from '../services/socketActions';
import { IS_CONTROL, IS_SCOREBOARD } from '../utils/viewMode';
import { getPluginDefaultState, getPluginHandlers } from '../plugins';

const PLAYS_AUDIO = !IS_CONTROL && !IS_SCOREBOARD;

// Utility — add an id to seenIds (reads/writes sessionStore directly)
function markSeen(id) {
  const { seenIds } = useSessionStore.getState();
  if (seenIds.includes(id)) return;
  useSessionStore.setState({ seenIds: [...seenIds, id] });
}

export const useGameStore = create((set, get) => ({
  // ── Shared ────────────────────────────────────────────────────────────
  gameMode:     'quiz',
  winner:       null,
  verdict:      null,   // 'correct'|'wrong'|null
  scores:       {},
  pointsStake:  100,
  autoWrongMs:  3000,
  buzzCountdown: null,
  buzzerOpen:   true,
  buzzersOn:    true,
  connected:    false,
  presetsReady: true,
  setupLog:     [],
  auraState:    {},   // { [hexId]: boolean } — moderator-toggled persistent aura
  mqttClientIpMap: {},

  // ── Teams ────────────────────────────────────────────────────────────
  teamAssignments: {},   // { playerId: teamIndex }
  teamNames:       [],   // ['Team 1', 'Team 2', ...]
  teamColors:      [],   // [[r,g,b], ...]
  teamMode:        false,

  // ── Plugin state (auto-merged) ────────────────────────────────────
  ...getPluginDefaultState(),

  // ── Hint ─────────────────────────────────────────────────────────────
  hintIndex:     0,
  lockedOutIds:  [],

  // ── Reflex ────────────────────────────────────────────────────────────
  reflexPhase:       'idle',
  reflexColor:       null,
  reflexCountdown:   null,
  reflexBuzzes:      [],
  reflexFalseStarts: [],
  reflexResult:      null,

  // ── Precision ─────────────────────────────────────────────────────────
  precisionPhase:     'idle',
  precisionCountdown: null,
  precisionBuzzes:    [],
  precisionResult:    null,
  precisionTarget:    5000,

  // ── Elimination ───────────────────────────────────────────────────────
  eliminationPhase:  'idle',
  eliminationBuzzes: [],
  eliminationResult: null,
  _elimStart:        null,
  _elimDuration:     null,

  // ── Bomb ──────────────────────────────────────────────────────────────
  bombPhase:    'idle',
  bombDuration: 10000,
  bombBuzzes:   [],
  bombResult:   null,
  _bombStart:   null,
  _bombCap:     null,

  // ── Survivor ──────────────────────────────────────────────────────────
  survivorPhase:      'idle',
  survivorEliminated: [],
  survivorRound:      0,
  survivorDone:       null,

  // ── Sport Timer ───────────────────────────────────────────────────────
  timerPhase:       'idle',
  timerCountdown:   null,
  timerBuzzes:      [],
  timerResult:      null,
  timerScoringType: 'fastest',
  timerDuration:    0,            // 0 = unlimited, >0 = countdown cap in ms
  _timerStart:      null,
  _timerCap:        null,         // cap for useElapsed (= duration when counting down)

  // ── Iterative Timer ───────────────────────────────────────────────────
  iterPhase:       'idle',
  iterCurrent:     null,
  iterTimes:       [],
  iterResult:      null,
  iterScoringType: 'fastest',
  iterDuration:    0,             // 0 = unlimited, >0 = per-player countdown in ms
  iterAmounts:     {},
  _iterStart:      null,
  _iterCap:        null,          // cap for useElapsed (= duration when counting down)

  // ── Actions ──────────────────────────────────────────────────────────
  setIterAmounts(v) {
    set({ iterAmounts: typeof v === 'function' ? v(get().iterAmounts) : v });
  },

  judgeAnswer(verdict) {
    const { winner, pointsStake, hintIndex } = get();
    const q = useQuizStore.getState().getCurrentQ();
    let scoring, penalty;
    if (q?.mode === 'hint' && Array.isArray(q.scoring)) {
      scoring = q.scoring[hintIndex] ?? q.scoring[q.scoring.length - 1] ?? pointsStake;
      penalty = q.penalty !== undefined ? Number(q.penalty) : 0; // hint default: 0 penalty
    } else {
      scoring = q?.scoring !== undefined ? Number(q.scoring) : pointsStake;
      penalty = q?.penalty !== undefined ? Number(q.penalty) : undefined;
    }
    useAudioStore.getState().stopTick();
    emitLoopControl(socket, null);
    emitJudgeCall(socket, winner, verdict, scoring, penalty);
  },

  getSetupsStatus() {
    return Object.fromEntries(
      get().setupLog.filter(l => l.name).map(l => [l.name, l.type])
    );
  },

  // ── Socket handlers ───────────────────────────────────────────────────
  onConnect()    { set({ connected: true }); },
  onDisconnect() { set({ connected: false }); },

  onGameMode(d) { set({ gameMode: d.mode }); },

  onWinner(d) {
    const id = d.id;
    set({ winner: id, verdict: null });
    const audio = useAudioStore.getState();
    const { hasInteracted } = useSessionStore.getState();
    audio.stopLoop();
    if (hasInteracted && PLAYS_AUDIO) { audio.playBuzz(); audio.playTick(); }
    markSeen(id);
  },

  onReset() {
    const audio = useAudioStore.getState();
    audio.stopLoop(); audio.stopTick();
    set({ winner: null, verdict: null });
    useQuizStore.setState({ answerReveal: { chosenIndex: null, correctIndex: null } });
  },

  onGameState(data) {
    if (!data.locked) {
      const audio = useAudioStore.getState();
      audio.stopLoop(); audio.stopTick();
      set({ winner: null, verdict: null });
      useQuizStore.setState({ answerReveal: { chosenIndex: null, correctIndex: null } });
    }
  },

  onVerdict(data, playVerdict) {
    playVerdict(data.verdict);
    set({ verdict: data.verdict });
  },

  // ── Plugin handlers (auto-merged) ────────────────────────────────
  ...getPluginHandlers()(set, get),

  // ── Team handlers ────────────────────────────────────────────────────
  onTeamState(d) {
    set({
      teamAssignments: d.assignments ?? {},
      teamNames: d.names ?? [],
      teamColors: d.colors ?? [],
      teamMode: !!d.active,
    });
  },

  // ── Hint handlers ────────────────────────────────────────────────────
  onHintState(d) { set({ hintIndex: d.hintIndex ?? 0, lockedOutIds: d.lockedOutIds ?? [] }); },

  onScoreUpdate(data)     { set({ scores: data.scores }); },
  onBuzzerOpen(d)         { set({ buzzerOpen: d.open }); },
  onAutoWrongMs(data)     { set({ autoWrongMs: data.ms }); },
  onCurrentPoints(data)   { set({ pointsStake: data.points }); },
  onMqttClientIpMap(data) { set({ mqttClientIpMap: data }); },

  onRosterPresetsReady(ready) {
    set({ presetsReady: ready });
    if (ready) setTimeout(() => set({ setupLog: [] }), 1200);
  },

  onRosterSetupProgress(msg) {
    set(s => {
      const prev = s.setupLog;
      if (msg.type === 'roster')      return { setupLog: [{ type: 'roster', text: `Roster: ${msg.names.join(', ')}` }] };
      if (msg.type === 'setting-up')  return { setupLog: [...prev, { type: 'setting-up', name: msg.name, text: `Setting up ${msg.name}…` }] };
      if (msg.type === 'done')        return { setupLog: prev.map(l => l.name === msg.name && l.type === 'setting-up' ? { ...l, type: 'done', text: `${msg.name} ready.` } : l) };
      if (msg.type === 'skipped')     return { setupLog: [...prev, { type: 'skipped', text: `⚠️  ${msg.name} skipped (no IP)` }] };
      return {};
    });
  },

  // ── Reflex ────────────────────────────────────────────────────────────
  onReflexState(d, playLoop) {
    set({ reflexPhase: d.state });
    if (d.state === 'sequence') playLoop(1);
    if (d.state === 'idle')     set({ reflexColor: null, reflexCountdown: null, reflexBuzzes: [], reflexFalseStarts: [], reflexResult: null });
  },
  onReflexCountdown(d) { set({ reflexCountdown: d.count, reflexColor: null }); },
  onReflexFlash(d)     { set({ reflexColor: d.color, reflexCountdown: null }); },
  onReflexFalseStart(d) {
    set(s => ({ reflexFalseStarts: s.reflexFalseStarts.includes(d.id) ? s.reflexFalseStarts : [...s.reflexFalseStarts, d.id] }));
    markSeen(d.id);
  },
  onReflexBuzz(d) {
    set(s => ({ reflexBuzzes: [...s.reflexBuzzes, d] }));
    markSeen(d.id);
  },
  onReflexResult(d, stopLoop) { stopLoop(); set({ reflexResult: d }); },
  onReflexAborted(stopLoop)   { stopLoop(); set({ reflexPhase: 'idle', reflexColor: null, reflexCountdown: null, reflexBuzzes: [], reflexFalseStarts: [], reflexResult: null }); },
  onReflexReset()             { set({ reflexPhase: 'idle', reflexColor: null, reflexCountdown: null, reflexBuzzes: [], reflexFalseStarts: [], reflexResult: null }); },

  // ── Precision ─────────────────────────────────────────────────────────
  onPrecisionTarget(d)    { set({ precisionTarget: d.ms }); },
  onPrecisionState(d) {
    set({ precisionPhase: d.state });
    if (d.state === 'countdown' || d.state === 'idle') set({ precisionCountdown: null, precisionBuzzes: [], precisionResult: null });
  },
  onPrecisionCountdown(d) { set({ precisionCountdown: d.count }); },
  onPrecisionCue()        { set({ precisionCountdown: null }); },
  onPrecisionBuzz(d) {
    set(s => ({ precisionBuzzes: [...s.precisionBuzzes, d] }));
    markSeen(d.id);
  },
  onPrecisionResult(d)    { set({ precisionResult: d }); },
  onPrecisionAborted()    { set({ precisionPhase: 'idle', precisionCountdown: null, precisionBuzzes: [], precisionResult: null }); },
  onPrecisionReset()      { set({ precisionPhase: 'idle', precisionCountdown: null, precisionBuzzes: [], precisionResult: null }); },

  // ── Elimination ───────────────────────────────────────────────────────
  onEliminationState(d) {
    set({ eliminationPhase: d.state });
    if (d.state === 'open') set({ eliminationBuzzes: [], eliminationResult: null });
    if (d.state === 'idle') { set({ eliminationBuzzes: [], eliminationResult: null, _elimStart: null, _elimDuration: null }); }
  },
  onEliminationWindow(d) {
    set({ _elimStart: Date.now(), _elimDuration: d.windowMs });
  },
  onEliminationBuzz(d) {
    set(s => ({ eliminationBuzzes: [...s.eliminationBuzzes.filter(b => b.id !== d.id), d] }));
    markSeen(d.id);
  },
  onEliminationResult(d)  { set({ eliminationResult: d, _elimStart: null, _elimDuration: null }); },
  onEliminationAborted()  { set({ eliminationPhase: 'idle', eliminationBuzzes: [], eliminationResult: null, _elimStart: null, _elimDuration: null }); },
  onEliminationReset()    { set({ eliminationPhase: 'idle', eliminationBuzzes: [], eliminationResult: null, _elimStart: null, _elimDuration: null }); },

  // ── Bomb ──────────────────────────────────────────────────────────────
  onBombDuration(d) { set({ bombDuration: d.ms }); },
  onBombState(d) {
    set({ bombPhase: d.state });
    if (d.state === 'idle') { set({ bombBuzzes: [], bombResult: null, _bombStart: null, _bombCap: null }); }
  },
  onBombStarted(d) {
    set({ bombBuzzes: [], bombResult: null, _bombStart: Date.now(), _bombCap: d.duration });
  },
  onBombBuzz(d) {
    set(s => ({ bombBuzzes: [...s.bombBuzzes, d] }));
    markSeen(d.id);
  },
  onBombResult(d)   { set({ bombResult: d, _bombStart: null, _bombCap: null }); },
  onBombAborted()   { set({ bombPhase: 'idle', bombBuzzes: [], bombResult: null, _bombStart: null, _bombCap: null }); },
  onBombReset()     { set({ bombPhase: 'idle', bombBuzzes: [], bombResult: null, _bombStart: null, _bombCap: null }); },

  // ── Survivor ──────────────────────────────────────────────────────────
  onSurvivorState(d) {
    set({ survivorPhase: d.state, survivorEliminated: d.eliminated ?? [], survivorRound: d.round ?? 0 });
    if (d.state === 'idle') set({ survivorDone: null });
  },
  onSurvivorElimination(d) { set(s => ({ survivorEliminated: [...s.survivorEliminated, d.eliminatedId] })); },
  onSurvivorDone(d)        { set({ survivorDone: d.winnerId }); },
  onSurvivorAborted()      { set({ survivorPhase: 'idle', survivorEliminated: [], survivorRound: 0, survivorDone: null }); },

  // ── Sport Timer ───────────────────────────────────────────────────────
  onTimerState(d) {
    set({ timerPhase: d.state });
    if (d.scoringType !== undefined) set({ timerScoringType: d.scoringType });
    if (d.duration !== undefined) set({ timerDuration: d.duration });
    if (d.state === 'idle') { set({ timerBuzzes: [], timerResult: null, _timerStart: null, _timerCap: null, timerDuration: 0 }); }
  },
  onTimerCountdown(d) { set({ timerCountdown: d.count }); },
  onTimerStarted(playLoop, questionIndex, questions, duration) {
    const dur = duration || 0;
    set({ timerBuzzes: [], timerResult: null, _timerStart: Date.now(), timerCountdown: null, timerDuration: dur, _timerCap: dur || null });
    playLoop(questions[questionIndex]?.loop ?? 2);
  },
  onTimerBuzz(d) {
    set(s => ({ timerBuzzes: [...s.timerBuzzes, d] }));
    markSeen(d.id);
    if (PLAYS_AUDIO) useAudioStore.getState().playTimesUp();
  },
  onTimerResult(d, stopLoop)  { set({ timerResult: d, _timerStart: null, _timerCap: null }); stopLoop(); },
  onTimerAborted(stopLoop)    { stopLoop(); set({ timerPhase: 'idle', timerBuzzes: [], timerResult: null, timerCountdown: null, _timerStart: null, _timerCap: null, timerDuration: 0 }); },
  onTimerReset()              { set({ timerPhase: 'idle', timerBuzzes: [], timerResult: null, timerCountdown: null, _timerStart: null, _timerCap: null, timerDuration: 0 }); },

  // ── Iterative Timer ───────────────────────────────────────────────────
  onIterState(d) {
    set({ iterPhase: d.state, iterCurrent: d.current ?? null, iterTimes: d.times ?? [] });
    if (d.scoringType) set({ iterScoringType: d.scoringType });
    if (d.duration !== undefined) set({ iterDuration: d.duration });
    if (d.state === 'idle') { set({ iterResult: null, iterAmounts: {}, iterScoringType: 'fastest', iterDuration: 0, _iterStart: null, _iterCap: null }); }
  },
  onIterStarted(d, playLoop, questionIndex, questions) {
    const dur = d.duration || 0;
    set({ _iterStart: d.startTime, iterDuration: dur, _iterCap: dur || null });
    playLoop(questions[questionIndex]?.loop ?? 4);
  },
  onIterStopped(stopLoop, playTimesUp) { set({ _iterStart: null, _iterCap: null }); stopLoop(); playTimesUp(); },
  onIterResult(d)  { set({ iterResult: d, _iterStart: null, _iterCap: null }); if (d.scoringType) set({ iterScoringType: d.scoringType }); },
  onIterAborted(stopLoop) { stopLoop(); set({ iterPhase: 'idle', iterCurrent: null, iterTimes: [], iterResult: null, iterAmounts: {}, iterScoringType: 'fastest', iterDuration: 0, _iterStart: null, _iterCap: null }); },
  onIterReset() { set({ iterPhase: 'idle', iterCurrent: null, iterTimes: [], iterResult: null, iterAmounts: {}, iterScoringType: 'fastest', iterDuration: 0, _iterStart: null, _iterCap: null }); },
}));
