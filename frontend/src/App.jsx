import React from 'react';
import './App.css';
import WledDiscovery    from './components/WledDiscovery';
import SetupScreen        from './components/screens/system/SetupScreen';
import DisplaySetupScreen from './components/screens/system/DisplaySetupScreen';
import QuestionsEditor  from './components/screens/system/QuestionsEditor';
import BladeLockToast   from './components/BladeLockToast';
import Scoreboard       from './components/Scoreboard';
import FinalScreen      from './components/screens/system/FinalScreen';
import RoundHistoryScreen from './components/screens/system/RoundHistoryScreen';
import SettingsScreen   from './components/screens/system/SettingsScreen';
import ReflexScreen     from './components/screens/modes/ReflexScreen';
import PrecisionScreen  from './components/screens/modes/PrecisionScreen';
import EliminationScreen from './components/screens/modes/EliminationScreen';
import BombScreen       from './components/screens/modes/BombScreen';
import SurvivorScreen   from './components/screens/modes/SurvivorScreen';
import IterScreen       from './components/screens/modes/IterScreen';
import { getPluginScreens, getPluginManifests } from './plugins';
import TimerScreen      from './components/screens/modes/TimerScreen';
import TopBar           from './components/TopBar';
import DevDock           from './components/DevDock';
import GameScreens      from './components/GameScreens';
import MediaDock        from './components/MediaDock';
import VideoOverlay     from './components/VideoOverlay';
import ImageZoomOverlay from './components/ImageZoomOverlay';
import PackManager      from './components/PackManager';
import GlobalFileDrop   from './components/GlobalFileDrop';
import ScoreboardBlade  from './components/ScoreboardBlade';
import QuestionCard     from './components/screens/modes/QuestionCard';
import DisplayCard      from './components/screens/modes/DisplayCard';
import { IS_MODERATOR, IS_CONTROL, IS_SCOREBOARD } from './utils/viewMode';
import { useGameStore }    from './store/gameStore';
import { useSessionStore } from './store/sessionStore';
import { useAppInit }      from './hooks/useAppInit';
import { useBuzzCountdown } from './hooks/useBuzzCountdown';
import { useHotkeys } from 'react-hotkeys-hook';

function App() {
  const {
    gameMode,
    reflexPhase, precisionPhase, eliminationPhase, bombPhase, survivorPhase, timerPhase, iterPhase,
    ...storeState
  } = useGameStore();

  const pluginScreens = getPluginScreens();
  const pluginManifests = getPluginManifests();

  const {
    hasInteracted,toggleDevMode,
    showSettings, showDiscovery, showQuestionsEditor, showFinalScreen, statsOpen,
    scoreboardVariant, showPackManager,
  } = useSessionStore();

  useAppInit();
  useBuzzCountdown();
  useHotkeys('ctrl+alt+y', () => toggleDevMode());

  if (!hasInteracted)      return <GlobalFileDrop>
    {IS_CONTROL ? <SetupScreen /> : <DisplaySetupScreen />}
    {showPackManager && <PackManager onClose={() => useSessionStore.setState({ showPackManager: false })} />}
  </GlobalFileDrop>;
  if (IS_SCOREBOARD)       return (
    <div className={`fullscreen fullscreen--scoreboard state-idle`}>
      {scoreboardVariant === 'blade' ? <ScoreboardBlade /> : <Scoreboard />}
    </div>
  );
  if (showDiscovery)       return <WledDiscovery />;
  if (showQuestionsEditor) return <QuestionsEditor />;
  if (showFinalScreen)     return <FinalScreen />;
  if (statsOpen)           return <RoundHistoryScreen />;
  if (showSettings)        return <SettingsScreen />;

  const isReflexActive    = gameMode === 'reflex'      && reflexPhase      !== 'idle';
  const isPrecisionActive = gameMode === 'precision'   && precisionPhase   !== 'idle';
  const isElimActive      = gameMode === 'elimination' && eliminationPhase !== 'idle';
  const isBombActive      = gameMode === 'bomb'        && bombPhase        !== 'idle';
  const isSurvivorActive  = gameMode === 'survivor'    && survivorPhase    !== 'idle';
  const isTimerActive     = gameMode === 'timer'       && timerPhase       !== 'idle';
  const isIterActive      = gameMode === 'itimer'      && iterPhase        !== 'idle';
  // Check plugin modes
  const activePlugin = pluginManifests.find(m => gameMode === m.name && storeState[m.phaseKey] !== 'idle');

  let bgClass = 'state-idle';
  if (isReflexActive)         bgClass = 'state-reflex';
  else if (isPrecisionActive) bgClass = 'state-precision';
  else if (isElimActive)      bgClass = 'state-elimination';
  else if (isBombActive)      bgClass = 'state-bomb';
  else if (isSurvivorActive)  bgClass = 'state-survivor';
  else if (isTimerActive)     bgClass = 'state-timer';
  else if (isIterActive)      bgClass = 'state-timer';
  else if (activePlugin)      bgClass = activePlugin.bgClass ?? `state-${activePlugin.name}`;



  return (
    <GlobalFileDrop>
      <div className={`fullscreen ${bgClass}${IS_MODERATOR ? ' fullscreen--moderator' : ''}`}>
        <DevDock />
        <BladeLockToast />
        <TopBar />
        {isReflexActive    ? <ReflexScreen />      :
         isPrecisionActive ? <PrecisionScreen />   :
         isElimActive      ? <EliminationScreen /> :
         isBombActive      ? <BombScreen />        :
         isSurvivorActive  ? <SurvivorScreen />    :
         activePlugin && pluginScreens[activePlugin.name] ? <React.Suspense fallback={null}>{React.createElement(pluginScreens[activePlugin.name])}</React.Suspense> :
         isIterActive      ? <IterScreen />        :
         isTimerActive     ? <TimerScreen />       : (
          <div className="idle-screen">
            {IS_MODERATOR && <Scoreboard />}
            {!IS_CONTROL && <div className="pulse-ring" />}
            <GameScreens />
            <QuestionCard />
            <MediaDock />
            <DisplayCard />
            <VideoOverlay />
            <ImageZoomOverlay />
            {!IS_MODERATOR && <Scoreboard />}
          </div>
        )}
        {showPackManager && <PackManager onClose={() => useSessionStore.setState({ showPackManager: false })} />}
      </div>
    </GlobalFileDrop>
  );
}

export default App;
