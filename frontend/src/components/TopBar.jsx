import {
  Settings, FileEdit, BarChart2,
  Zap, Target, Moon, Lightbulb, LightbulbOff,
  Bomb, Signal, Trophy, Timer, Hourglass,
  Lock, LockOpen,
} from 'lucide-react';
import { useGameStore }    from '../store/gameStore';
import { useSessionStore } from '../store/sessionStore';
import { IS_CONTROL, IS_MASTER, IS_MODERATOR } from '../utils/viewMode';
import FullscreenButton from './FullscreenButton';
import logoIcon from '../assets/icon.png';
import socket from '../services/socket';
import { useShallow } from 'zustand/shallow';

export default function TopBar() {
  const { gameMode, presetsReady, buzzerOpen, buzzersOn, connected } = useGameStore(
    useShallow(({ gameMode, presetsReady, buzzerOpen, buzzersOn, connected }) =>
      ({ gameMode, presetsReady, buzzerOpen, buzzersOn, connected }))
  );
  const { openSettings } = useSessionStore(useShallow(({ openSettings }) => ({ openSettings })));

  if (!IS_CONTROL) return null;

  return (
    <div className={`top-bar${presetsReady ? '' : ' top-bar--loading'}${IS_MODERATOR ? ' top-bar--moderator' : ''}`}>
      <div className="top-bar-left">
        {IS_MODERATOR && <img src={logoIcon} alt="" className="top-bar-logo" />}
        <button className="btn btn--icon btn--small btn--ghost" onClick={openSettings} title="Edit player names"><Settings size={16} /></button>
        {(IS_MODERATOR || IS_MASTER) && <button className="btn btn--icon btn--small btn--ghost" onClick={() => useSessionStore.setState({ showQuestionsEditor: true })} title="Edit questions"><FileEdit size={16} /></button>}
        <button className="btn btn--icon btn--small btn--ghost" onClick={() => socket.emit('setStatsOpen', { open: true })} title="Round history"><BarChart2 size={16} /></button>
      </div>

      {IS_MASTER && <div className="mode-toggle">
        <label htmlFor="mode-select" className="visually-hidden">Game mode</label>
        <select
          id="mode-select"
          className="mode-select"
          value={gameMode}
          onChange={(e) => socket.emit('setGameMode', { mode: e.target.value })}
        >
          <option value="quiz">Quiz</option>
          <option value="reflex">Reflex</option>
          <option value="precision">Precision</option>
          <option value="elimination">Elimination</option>
          <option value="bomb">Bomb</option>
          <option value="survivor">Survivor</option>
          <option value="timer">Timer</option>
          <option value="itimer">I-Timer</option>
        </select>
      </div>}

      <div className="top-bar-right">
        <div className={`master-controls${presetsReady ? '' : ' master-controls--loading'}`}>
          <button className="btn btn--icon btn--small btn--ghost" disabled={!presetsReady} onClick={() => socket.emit('wledIdle')} title="Set all buzzers to idle (breathing blue)"><Moon size={13} /></button>
          <button
            className={`btn btn--icon btn--small btn--ghost ${buzzerOpen ? 'open' : 'locked'}`}
            data-test="btn-buzzer"
            onClick={() => socket.emit('setBuzzerOpen', { open: !buzzerOpen })}
            title={buzzerOpen ? 'Lock buzzers (prevent new buzzes)' : 'Unlock buzzers'}
          >{buzzerOpen ? <LockOpen size={13} /> : <Lock size={13} />}</button>
          <button
            className={`btn btn--icon btn--small btn--ghost ${buzzersOn ? 'on' : 'off'}`}
            data-test="btn-toggle"
            disabled={!presetsReady}
            onClick={() => {
              const next = !buzzersOn;
              useGameStore.setState({ buzzersOn: next });
              socket.emit('wledBrightness', { bri: next ? 128 : 0 });
            }}
            title="Toggle buzzer brightness on/off"
          >{buzzersOn ? <Lightbulb size={13} /> : <LightbulbOff size={13} />}</button>
          {IS_MASTER && <button className="btn btn--icon btn--small btn--ghost" disabled={!presetsReady} onClick={() => socket.emit('wledPress')} title="Trigger PRESS flash on all buzzers"><Zap size={13} /></button>}
          <FullscreenButton />
        </div>
        {!IS_MODERATOR && <div className={`conn-dot ${connected ? 'online' : 'offline'}`}
             title={connected ? 'Server online' : 'Server offline'} />}
      </div>
    </div>
  );
}
