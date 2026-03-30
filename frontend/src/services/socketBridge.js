/* eslint-disable no-unused-vars */
// socketBridge.js — registers all socket.io listeners and routes events to Zustand stores.
// Called once from App.jsx after the first user interaction.
import socket from './socket';
import { useAudioStore } from '../store/audioStore';
import { useGameStore }  from '../store/gameStore';
import { useQuizStore }  from '../store/quizStore';
import { useSessionStore } from '../store/sessionStore';
import { useSetupStore }   from '../store/setupStore';
import { refreshAvatars }  from '../utils/avatarHelpers';
import { IS_CONTROL, IS_SCOREBOARD } from '../utils/viewMode';
import { fetchQuestions, fetchQuestionSets } from './api';
import { BACKEND_URL } from '../utils/viewMode';
import { registerPluginBridges } from '../plugins';

const PLAYS_AUDIO = !IS_CONTROL && !IS_SCOREBOARD;

export function registerSocketListeners() {
  const audio   = () => useAudioStore.getState();
  const game    = () => useGameStore.getState();
  const quiz    = () => useQuizStore.getState();
  const session = () => useSessionStore.getState();

  // ── Connection ────────────────────────────────────────────────────────
  socket.on('connect',    () => { game().onConnect(); socket.emit('requestState'); });
  socket.on('disconnect', () => game().onDisconnect());

  // ── Winner / reset ────────────────────────────────────────────────────
  socket.on('winner', (d) => game().onWinner(d));
  socket.on('reset',  ()  => game().onReset());
  socket.on('gameState', (data) => game().onGameState(data));

  socket.on('verdict', (data) => {
    if (PLAYS_AUDIO) audio().playVerdict(data.verdict);
    useGameStore.setState({ verdict: data.verdict });
  });

  // ── Scoring / settings ────────────────────────────────────────────────
  socket.on('scoreUpdate',    (data) => {
    try { game().onScoreUpdate(data); } catch (e) { /* ignore */ }
  });
  socket.on('displayNames',   (data) => session().onDisplayNames(data));
  socket.on('buzzerOpen',     (d)    => game().onBuzzerOpen(d));
  socket.on('autoWrongMs',    (data) => game().onAutoWrongMs(data));
  socket.on('autoWrongSignal',()     => { if (PLAYS_AUDIO) audio().playTimesUp(); });
  socket.on('currentPoints',  (data) => game().onCurrentPoints(data));
  socket.on('mqttClientIpMap',(data) => game().onMqttClientIpMap(data));
  socket.on('gameMode',       (d)    => game().onGameMode(d));

  socket.on('theme', (d) => {
    document.documentElement.setAttribute('data-theme', d.theme === 'default' ? '' : d.theme);
    sessionStorage.setItem('buzzer-theme', d.theme);
    useSessionStore.setState({ theme: d.theme });
  });

  socket.on('scoreboardPos', (d) => {
    sessionStorage.setItem('buzzer-scoreboard-pos', d.pos);
    useSessionStore.setState({ scoreboardPos: d.pos });
  });
  socket.on('scoreboardActiveOnly', (d) => {
    sessionStorage.setItem('buzzer-scoreboard-active-only', String(!!d.active));
    useSessionStore.setState({ scoreboardActiveOnly: !!d.active });
  });
  socket.on('scoreboardVariant', (d) => {
    sessionStorage.setItem('buzzer-scoreboard-variant', d.variant);
    useSessionStore.setState({ scoreboardVariant: d.variant });
  });
  socket.on('scoreboardTopN', (d) => useSessionStore.setState({ scoreboardTopN: d.topN ?? 0 }));
  socket.on('scoreboardShowGaps', (d) => useSessionStore.setState({ scoreboardShowGaps: !!d.showGaps }));

  // Avatar settings from server (size, variant, imageStyle)
  socket.on('avatarSettings', (d) => session().onAvatarSettings(d));

  // ── Roster setup ──────────────────────────────────────────────────────
  socket.on('rosterPresetsReady',   (ready) => game().onRosterPresetsReady(ready));
  socket.on('rosterSetupProgress',  (msg)   => game().onRosterSetupProgress(msg));
  socket.on('gameStarted',          (d)     => session().onGameStarted(d));
  socket.on('buzzerRoster',         (roster) => session().onGameStarted({ roster }));
  socket.on('gameEnded',            ()      => {
    useSessionStore.setState({ hasInteracted: false, seenIds: [] });
    useGameStore.setState({ winner: null, verdict: null, presetsReady: false });
  });

  // ── Setup state (colorMap for scoreboard / display views) ─────────────
  socket.on('setupSnapshot', (snapshot) => {
    const next = {};
    for (const [hexId, data] of Object.entries(snapshot)) {
      if (data.color !== undefined) next[hexId] = { color: data.color, useIndividual: !!data.useIndividual };
    }
    if (Object.keys(next).length > 0) {
      useSetupStore.setState(s => ({ colorMap: { ...s.colorMap, ...next } }));
    }
  });
  socket.on('setupColorChange', ({ hexId, color, useIndividual }) => {
    if (!hexId) return;
    useSetupStore.setState(s => ({ colorMap: { ...s.colorMap, [hexId]: { color, useIndividual: !!useIndividual } } }));
  });

  // ── Aura state (persistent player aura toggled by moderator) ──────────
  socket.on('auraState', (d) => useGameStore.setState({ auraState: d ?? {} }));

  // ── Loop control ──────────────────────────────────────────────────────
  socket.on('loopControl', (d) => audio().syncLoopControl(d.n, !PLAYS_AUDIO));

  // ── Video control (one-shot) ────────────────────────────────────────
  socket.on('videoControl', (d) => useSessionStore.setState({ playingVideo: d.url ?? null }));

  // ── Image zoom (moderator → display) ──────────────────────────────
  socket.on('imageZoom', (d) => useSessionStore.setState({ zoomedImage: d.src ?? null }));

  // ── Plugin socket listeners (auto-registered) ─────────────────────
  registerPluginBridges(socket, game);

  // ── Teams ───────────────────────────────────────────────────────────
  socket.on('teamState', (d) => game().onTeamState(d));

  // ── Hint mode ───────────────────────────────────────────────────────
  socket.on('hintState',   (d) => game().onHintState(d));
  socket.on('hintLockout', (d) => {
    // Brief toast-like notification (reuse bladeLock UI)
    const name = session().nameMap[d.id] || d.name || d.id;
    session().onBladeLock({ id: d.id, name, count: 0, penalty: 0 });
  });

  // ── Quiz questions ────────────────────────────────────────────────────
  socket.on('questionIndex', (d) => { quiz().onQuestionIndex(d, () => audio().stopLoop()); useSessionStore.setState({ zoomedImage: null }); });
  socket.on('showQuestion',  (d) => quiz().onShowQuestion(d));
  socket.on('showAnswer',    (d) => quiz().onShowAnswer(d));
  socket.on('showAnswersOnly',(d) => quiz().onShowAnswersOnly(d));
  socket.on('answerReveal',  (d) => quiz().onAnswerReveal(d));
  // Seed current question on connect — eliminates race with HTTP fetch
  socket.on('currentQuestion', ({ index, question }) => {
    const qs = useQuizStore.getState().questions;
    if (!qs.length || !qs[index]) {
      const seeded = [...qs];
      seeded[index] = question;
      useQuizStore.setState({ questions: seeded });
    }
  });
  socket.on('questionsUpdated', () => {
    fetchQuestions().then(data => { if (data.length > 0) useQuizStore.setState({ questions: data }); }).catch(() => { /* ignore */ });
  });
  socket.on('activeSetChanged', ({ name }) => {
    useQuizStore.setState({ activeSet: name ?? null });
    fetchQuestionSets(BACKEND_URL)
      .then(({ sets }) => useQuizStore.setState({ questionSets: sets ?? [] }))
      .catch(() => { /* ignore */ });
  });
  socket.on('activePacksChanged', (active) => {
    if (active?.avatars !== undefined) {
      useSessionStore.setState({ activeAvatarPack: active.avatars });
      refreshAvatars();
      // Clear avatar-based icons from setup devices (they reference the old pack's files)
      const devices = useSetupStore.getState().devices;
      const updated = {};
      let changed = false;
      for (const [id, d] of Object.entries(devices)) {
        if (d.icon && d.icon.startsWith('avatar:')) {
          updated[id] = { ...d, icon: undefined };
          changed = true;
        } else {
          updated[id] = d;
        }
      }
      if (changed) {
        useSetupStore.setState({ devices: updated });
        for (const [id, d] of Object.entries(devices)) {
          if (d.icon && d.icon.startsWith('avatar:')) {
            socket.emit('setupIconChange', { hexId: id, icon: undefined });
          }
        }
      }
    }
    if (active?.questions) {
      useQuizStore.setState({ activeSet: active.questions });
      fetchQuestionSets(BACKEND_URL)
        .then(({ sets }) => useQuizStore.setState({ questionSets: sets ?? [] }))
        .catch(() => { /* ignore */ });
    }
  });
  socket.on('packsUpdated', () => {
    fetchQuestionSets(BACKEND_URL)
      .then(({ sets }) => useQuizStore.setState({ questionSets: sets ?? [] }))
      .catch(() => { /* ignore */ });
  });
  socket.on('loopNamesUpdated', (names) => session().onLoopNamesUpdated(names));

  // ── Reflex ────────────────────────────────────────────────────────────
  socket.on('reflexState',     (d) => game().onReflexState(d, (n) => { if (PLAYS_AUDIO) audio().playLoop(n); }));
  socket.on('reflexCountdown', (d) => game().onReflexCountdown(d));
  socket.on('reflexFlash',     (d) => game().onReflexFlash(d));
  socket.on('reflexFalseStart',(d) => game().onReflexFalseStart(d));
  socket.on('reflexBuzz',      (d) => game().onReflexBuzz(d));
  socket.on('reflexResult',  (d) => game().onReflexResult(d,  () => audio().stopLoop()));
  socket.on('reflexAborted', ()  => game().onReflexAborted(   () => audio().stopLoop()));
  socket.on('reflexReset',   ()  => game().onReflexReset());

  // ── Precision ─────────────────────────────────────────────────────────
  socket.on('precisionTarget',    (d) => game().onPrecisionTarget(d));
  socket.on('precisionState',     (d) => game().onPrecisionState(d));
  socket.on('precisionCountdown', (d) => game().onPrecisionCountdown(d));
  socket.on('precisionCue',       ()  => game().onPrecisionCue());
  socket.on('precisionBuzz',    (d) => game().onPrecisionBuzz(d));
  socket.on('precisionResult',  (d) => game().onPrecisionResult(d));
  socket.on('precisionAborted', ()  => game().onPrecisionAborted());
  socket.on('precisionReset',   ()  => game().onPrecisionReset());

  // ── Elimination ───────────────────────────────────────────────────────
  socket.on('eliminationState',  (d) => game().onEliminationState(d));
  socket.on('eliminationWindow', (d) => game().onEliminationWindow(d));
  socket.on('eliminationBuzz',  (d) => game().onEliminationBuzz(d));
  socket.on('eliminationResult',  (d) => game().onEliminationResult(d));
  socket.on('eliminationAborted', ()  => game().onEliminationAborted());
  socket.on('eliminationReset',   ()  => game().onEliminationReset());

  // ── Bomb ──────────────────────────────────────────────────────────────
  socket.on('bombDuration', (d) => game().onBombDuration(d));
  socket.on('bombState',    (d) => game().onBombState(d));
  socket.on('bombStarted',  (d) => game().onBombStarted(d));
  socket.on('bombBuzz',         (d) => game().onBombBuzz(d));
  socket.on('bombResult',  (d) => game().onBombResult(d));
  socket.on('bombAborted', ()  => game().onBombAborted());
  socket.on('bombReset',   ()  => game().onBombReset());

  // ── Survivor ──────────────────────────────────────────────────────────
  socket.on('survivorState',       (d) => game().onSurvivorState(d));
  socket.on('survivorElimination', (d) => game().onSurvivorElimination(d));
  socket.on('survivorDone',        (d) => game().onSurvivorDone(d));
  socket.on('survivorAborted',     ()  => game().onSurvivorAborted());

  // ── Sport Timer ───────────────────────────────────────────────────────
  socket.on('timerState',     (d) => game().onTimerState(d));
  socket.on('timerCountdown', (d) => game().onTimerCountdown(d));
  socket.on('timerStarted',   (d)  => {
    if (PLAYS_AUDIO) {
      const { questionIndex, questions } = useQuizStore.getState();
      game().onTimerStarted((n) => audio().playLoop(n), questionIndex, questions, d?.duration);
    } else {
      game().onTimerStarted(() => {}, 0, [], d?.duration);
    }
  });
  socket.on('timerBuzz',         (d) => game().onTimerBuzz(d));
  socket.on('timerResult',  (d) => game().onTimerResult(d,  () => audio().stopLoop()));
  socket.on('timerAborted', ()  => game().onTimerAborted(   () => audio().stopLoop()));
  socket.on('timerReset',   ()  => game().onTimerReset());

  // ── Iterative Timer ───────────────────────────────────────────────────
  socket.on('iterState', (d) => {
    // try { console.debug('socketBridge: iterState received', d); } catch (e) {}
    game().onIterState(d);
  });
  socket.on('iterStarted', (d) => {
    // try { console.debug('socketBridge: iterStarted received', d); } catch (e) {}
    if (PLAYS_AUDIO) {
      const { questionIndex, questions } = useQuizStore.getState();
      game().onIterStarted(d, (n) => audio().playLoop(n), questionIndex, questions);
    } else {
      game().onIterStarted(d, () => {}, 0, []);
    }
  });
  socket.on('iterStopped', () => game().onIterStopped(() => audio().stopLoop(), () => { if (PLAYS_AUDIO) audio().playTimesUp(); }));
  socket.on('iterResult',  (d) => game().onIterResult(d));
  socket.on('iterAborted', ()  => game().onIterAborted(() => audio().stopLoop()));
  socket.on('iterReset',   ()  => game().onIterReset());

  // ── Misc ──────────────────────────────────────────────────────────────
  socket.on('bladeLock',    (d)    => session().onBladeLock(d));
  socket.on('roundHistory', (data) => session().onRoundHistory(data));
  socket.on('statsOpen',    (d)    => session().onStatsOpen(d));
  socket.on('finalScreen',  (d)    => {
    session().onFinalScreen(d);
    if (d.open && PLAYS_AUDIO) audio().playChampion();
  });
  socket.on('saveResult',   (d)    => session().onSaveResult(d));
  // 'lang' handled by useAppInit (needs i18n context)

  // Request full state replay now that all listeners are registered
  // (the initial burst on 'connection' may have fired before listeners were ready)
  socket.emit('requestState');

  return () => {
    const events = [
      'connect','disconnect','winner','reset','gameState','verdict',
      'scoreUpdate','displayNames','buzzerOpen','autoWrongMs','autoWrongSignal','scoreboardActiveOnly','scoreboardVariant',
      'currentPoints','mqttClientIpMap','gameMode','theme','scoreboardPos','scoreboardTopN','scoreboardShowGaps',
      'rosterPresetsReady','rosterSetupProgress','gameStarted','buzzerRoster',
      'setupSnapshot','setupColorChange','loopControl',
      'questionIndex','showQuestion','showAnswer','showAnswersOnly','answerReveal',
      'questionsUpdated','activeSetChanged','loopNamesUpdated','videoControl','imageZoom','auraState',
      'teamState','hintState','hintLockout',
      'reflexState','reflexCountdown','reflexFlash','reflexFalseStart','reflexBuzz','reflexResult','reflexAborted','reflexReset',
      'precisionTarget','precisionState','precisionCountdown','precisionCue','precisionBuzz','precisionResult','precisionAborted','precisionReset',
      'eliminationState','eliminationWindow','eliminationBuzz','eliminationResult','eliminationAborted','eliminationReset',
      'bombDuration','bombState','bombStarted','bombBuzz','bombResult','bombAborted','bombReset',
      'survivorState','survivorElimination','survivorDone','survivorAborted',
      'timerState','timerCountdown','timerStarted','timerBuzz','timerResult','timerAborted','timerReset',
      'iterState','iterStarted','iterStopped','iterResult','iterAborted','iterReset',
      'bladeLock','roundHistory','statsOpen','finalScreen','saveResult',
        'avatarSettings',
    ];
    events.forEach(e => socket.off(e));
  };
}
