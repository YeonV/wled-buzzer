import { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import WledDiscovery from './WledDiscovery';
import SetupScreen from './SetupScreen';

// ─── Socket connection to Node backend ──────────────────────────────────────
const socket = io('http://localhost:1303', { autoConnect: true });

// ─── Persist name map to localStorage ───────────────────────────────────────
const LS_NAMES = 'buzzer-names';
const LS_IDS   = 'buzzer-seen-ids';

function loadNames()   { try { return JSON.parse(localStorage.getItem(LS_NAMES) ?? '{}'); } catch { return {}; } }
function loadSeenIds() { try { return JSON.parse(localStorage.getItem(LS_IDS)   ?? '[]'); } catch { return []; } }

function getPlayerName(id, nameMap) {
  return nameMap[id]?.trim() || id?.toUpperCase() || '???';
}

const REFLEX_COLOR_MAP = {
  red:    '#ff2200',
  yellow: '#ffdd00',
  green:  '#00dc50',
  purple: '#9b00ff',
  orange: '#ff8800',
  pink:   '#ff00ae',
  blue:   '#0050ff',
};

function App() {
  const [winner, setWinner]               = useState(null);
  const [connected, setConnected]         = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [verdict, setVerdict]             = useState(null);  // 'correct'|'wrong'|null

  // ── Scoring ──────────────────────────────────────────────────────────────
  const [scores,      setScores]      = useState({});   // { deviceId: number }
  const [pointsStake, setPointsStake] = useState(100);  // editable stake per round
  const [autoWrongMs, setAutoWrongMs] = useState(3000); // auto-wrong timer in ms

  // ── Name mapper state ────────────────────────────────────────────────────
  const [nameMap,  setNameMap]  = useState(loadNames);    // { deviceId: displayName }
  const [seenIds,  setSeenIds]  = useState(loadSeenIds);  // all device IDs ever seen
  const [mqttClientIpMap, setMqttClientIpMap] = useState({}); // { mqttClientId: ip }
  const [showSettings, setShowSettings] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [buzzersOn, setBuzzersOn] = useState(true); // master brightness toggle
  const [draft, setDraft]       = useState({});           // edits in progress
  const [presetsReady, setPresetsReady] = useState(true); // false while backend pushes presets after Start

  // ── Reflex mode ─────────────────────────────────────────────────────────────
  const [gameMode,           setGameMode]           = useState('quiz');
  const [reflexPhase,        setReflexPhase]        = useState('idle');
  const [reflexColor,        setReflexColor]        = useState(null);
  const [reflexCountdown,    setReflexCountdown]    = useState(null);
  const [reflexBuzzes,       setReflexBuzzes]       = useState([]);
  const [reflexFalseStarts,  setReflexFalseStarts]  = useState([]);
  const [reflexResult,       setReflexResult]       = useState(null);

  const audioRef        = useRef(null);
  const correctAudioRef = useRef(null);
  const wrongAudioRef   = useRef(null);
  const tickAudioRef    = useRef(null);
  const loopAudioRef    = useRef(null);
  const [playingLoop, setPlayingLoop] = useState(null); // 1|2|3|null

  // ── Audio init ────────────────────────────────────────────────────────
  useEffect(() => {
    audioRef.current        = new Audio('/buzzer.mp3');  audioRef.current.preload        = 'auto';
    correctAudioRef.current = new Audio('/correct.mp3'); correctAudioRef.current.preload = 'auto';
    wrongAudioRef.current   = new Audio('/wrong.mp3');   wrongAudioRef.current.preload   = 'auto';
    tickAudioRef.current    = new Audio('/tick.mp3');    tickAudioRef.current.preload    = 'auto';
    tickAudioRef.current.loop = true;
    loopAudioRef.current    = new Audio(); loopAudioRef.current.loop = true;
  }, []);

  const stopLoop = useCallback(() => {
    if (!loopAudioRef.current) return;
    loopAudioRef.current.pause();
    loopAudioRef.current.currentTime = 0;
    setPlayingLoop(null);
  }, []);

  const playLoop = useCallback((n) => {
    const audio = loopAudioRef.current;
    if (!audio) return;
    if (playingLoop === n) { stopLoop(); return; } // toggle off
    audio.pause();
    audio.src = `/loop${n}.mp3`;
    audio.currentTime = 0;
    audio.play().catch((e) => console.warn('Audio blocked:', e));
    setPlayingLoop(n);
  }, [playingLoop, stopLoop]);

  const playBuzz = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch((e) => console.warn('Audio blocked:', e));
  }, []);

  const playTick = useCallback(() => {
    if (!tickAudioRef.current) return;
    tickAudioRef.current.currentTime = 0;
    tickAudioRef.current.play().catch((e) => console.warn('Audio blocked:', e));
  }, []);

  const stopTick = useCallback(() => {
    if (!tickAudioRef.current) return;
    tickAudioRef.current.pause();
    tickAudioRef.current.currentTime = 0;
  }, []);

  const playVerdict = useCallback((v) => {
    stopTick();
    const ref = v === 'correct' ? correctAudioRef : wrongAudioRef;
    if (!ref.current) return;
    ref.current.currentTime = 0;
    ref.current.play().catch((e) => console.warn('Audio blocked:', e));
  }, [stopTick]);

  // ── Socket events ───────────────────────────────────────────────────────
  useEffect(() => {
    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('winner', (data) => {
      const id = data.id;
      setWinner(id);
      setVerdict(null);
      stopLoop();
      if (hasInteracted) { playBuzz(); playTick(); }

      // Register new device IDs automatically
      setSeenIds((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        localStorage.setItem(LS_IDS, JSON.stringify(next));
        return next;
      });
    });

    socket.on('autoWrongMs', (data) => setAutoWrongMs(data.ms));
    socket.on('currentPoints', (data) => setPointsStake(data.points));
    socket.on('mqttClientIpMap', (data) => setMqttClientIpMap(data));
    socket.on('gameMode', (d) => setGameMode(d.mode));
    socket.on('reflexState', (d) => {
      setReflexPhase(d.state);
      if (d.state === 'sequence') { playLoop(1); }
      if (d.state === 'idle') {
        setReflexColor(null); setReflexCountdown(null);
        setReflexBuzzes([]); setReflexFalseStarts([]); setReflexResult(null);
      }
    });
    socket.on('reflexCountdown', (d) => { setReflexCountdown(d.count); setReflexColor(null); });
    socket.on('reflexFlash',    (d) => { setReflexColor(d.color); setReflexCountdown(null); });
    socket.on('reflexFalseStart', (d) => {
      setReflexFalseStarts(prev => prev.includes(d.id) ? prev : [...prev, d.id]);
      setSeenIds(prev => { if (prev.includes(d.id)) return prev; const n = [...prev, d.id]; localStorage.setItem(LS_IDS, JSON.stringify(n)); return n; });
    });
    socket.on('reflexBuzz', (d) => {
      setReflexBuzzes(prev => [...prev, d]);
      setSeenIds(prev => { if (prev.includes(d.id)) return prev; const n = [...prev, d.id]; localStorage.setItem(LS_IDS, JSON.stringify(n)); return n; });
    });
    socket.on('reflexResult',  (d) => { stopLoop(); setReflexResult(d); });
    socket.on('reflexAborted', () => { stopLoop(); setReflexPhase('idle'); setReflexColor(null); setReflexCountdown(null); setReflexBuzzes([]); setReflexFalseStarts([]); setReflexResult(null); });
    socket.on('reflexReset',   () => { setReflexPhase('idle'); setReflexColor(null); setReflexCountdown(null); setReflexBuzzes([]); setReflexFalseStarts([]); setReflexResult(null); });
    socket.on('reset',     () => { stopLoop(); stopTick(); setWinner(null); setVerdict(null); });
    socket.on('gameState', (data) => { if (!data.locked) { stopLoop(); stopTick(); setWinner(null); setVerdict(null); } });
    socket.on('scoreUpdate', (data) => setScores(data.scores));
    socket.on('rosterPresetsReady', (ready) => setPresetsReady(ready));
    socket.on('verdict', (data) => {
      playVerdict(data.verdict); // stops tick + plays correct/wrong sound
      setVerdict(data.verdict);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('winner');
      socket.off('reset');
      socket.off('gameState');
      socket.off('scoreUpdate');
      socket.off('rosterPresetsReady');
      socket.off('verdict');
      socket.off('autoWrongMs');
      socket.off('currentPoints');
      socket.off('mqttClientIpMap');
      socket.off('gameMode');
      socket.off('reflexState');
      socket.off('reflexCountdown');
      socket.off('reflexFlash');
      socket.off('reflexFalseStart');
      socket.off('reflexBuzz');
      socket.off('reflexResult');
      socket.off('reflexAborted');
      socket.off('reflexReset');
    };
  }, [hasInteracted, playVerdict, playBuzz, playTick, stopTick, stopLoop, playLoop]);

  // ── Judge call ─────────────────────────────────────────────────────
  const handleJudge = (v) => {
    stopTick(); // stop tick immediately on click; verdict sound plays via socket echo
    socket.emit('judgeCall', { winnerId: winner, verdict: v, points: pointsStake });
  };

  // ── Name mapper helpers ──────────────────────────────────────────────────
  const openSettings = () => {
    setDraft({ ...nameMap });
    setShowSettings(true);
  };

  const saveNames = () => {
    const cleaned = Object.fromEntries(
      Object.entries(draft).filter(([, v]) => v.trim() !== '')
    );
    setNameMap(cleaned);
    localStorage.setItem(LS_NAMES, JSON.stringify(cleaned));
    setShowSettings(false);
  };

  const addRow = () => {
    const key = `device-${Date.now()}`;
    setDraft((d) => ({ ...d, [key]: '' }));
    setSeenIds((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      localStorage.setItem(LS_IDS, JSON.stringify(next));
      return next;
    });
  };

  const removeRow = (id) => {
    setDraft((d) => { const n = { ...d }; delete n[id]; return n; });
    setSeenIds((prev) => {
      const next = prev.filter((x) => x !== id);
      localStorage.setItem(LS_IDS, JSON.stringify(next));
      return next;
    });
  };

  // ── Initial click-to-unlock screen ──────────────────────────────────────
  const handleStart = (roster) => {
    // Merge roster names into nameMap
    const names = {};
    for (const { hexId, name } of roster) {
      if (name.trim()) names[hexId] = name.trim();
    }
    const merged = { ...nameMap, ...names };
    setNameMap(merged);
    localStorage.setItem(LS_NAMES, JSON.stringify(merged));

    // Pre-seed scoreboard with active buzzer IDs
    setSeenIds(prev => {
      const all = [...new Set([...prev, ...roster.map(r => r.hexId)])];
      localStorage.setItem(LS_IDS, JSON.stringify(all));
      return all;
    });

    // Send roster to backend (triggers preset push on all active buzzers)
    socket.emit('setBuzzerRoster', roster);
    setPresetsReady(false);

    // Unlock audio — clicking Start Game is the required browser gesture
    setHasInteracted(true);
  };

  if (!hasInteracted) {
    return <SetupScreen socket={socket} initialMqttMap={mqttClientIpMap} onStart={handleStart} />;
  }

  // ── Settings overlay ─────────────────────────────────────────────────────
  if (showDiscovery) {
    return <WledDiscovery onClose={() => setShowDiscovery(false)} />;
  }

  if (showSettings) {
    // All IDs to show = union of seenIds + any keys already in draft
    const allIds = [...new Set([...seenIds, ...Object.keys(draft)])];

    return (
      <div className="fullscreen state-idle">
        <div className="settings-panel">
          <h2>🎮 Player Names</h2>
          <p className="settings-hint">
            Device IDs come from WLED's MQTT client ID.<br />
            Buzz in once to auto-add a device here.
          </p>

          <table className="name-table">
            <thead>
              <tr><th>Device ID (raw)</th><th>Display Name</th><th></th></tr>
            </thead>
            <tbody>
              {allIds.length === 0 && (
                <tr><td colSpan={3} className="no-devices">No devices seen yet — buzz in to register!</td></tr>
              )}
              {allIds.map((id) => (
                <tr key={id}>
                  <td className="device-id">
                    {id}
                    {mqttClientIpMap[id] && <a href={`http://${mqttClientIpMap[id]}`} className="device-ip" target="_blank" rel="noopener noreferrer">{mqttClientIpMap[id]}</a>}
                  </td>
                  <td>
                    <input
                      className="name-input"
                      value={draft[id] ?? ''}
                      placeholder={id.toUpperCase()}
                      onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
                    />
                  </td>
                  <td>
                    <button className="remove-btn" onClick={() => removeRow(id)} title="Remove">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="auto-wrong-row">
            <label className="points-label">⏱ Auto-wrong timer</label>
            <input
              className="points-input"
              type="number"
              min="1"
              max="60"
              value={Math.round(autoWrongMs / 1000)}
              onChange={(e) => {
                const ms = Math.max(1000, Math.min(60000, Number(e.target.value) * 1000));
                setAutoWrongMs(ms);
                socket.emit('setAutoWrong', { ms });
              }}
            />
            <span className="points-label">seconds</span>
          </div>

          <div className="settings-actions">
            <button className="add-btn" onClick={addRow}>+ Add row</button>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                className="scan-btn"
                onClick={() => { setShowSettings(false); setShowDiscovery(true); }}
              >📡 Scan WLEDs</button>
              <button
                className="reset-scores-btn"
                onClick={() => { if (window.confirm('Reset all scores to 0?')) socket.emit('resetScores'); }}
              >Reset Scores 🗑</button>
              <button className="cancel-btn" onClick={() => setShowSettings(false)}>Cancel</button>
              <button className="save-btn"   onClick={saveNames}>Save ✓</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main game view ───────────────────────────────────────────────────────
  const isReflexActive = gameMode === 'reflex' && reflexPhase !== 'idle';
  return (
    <div className={`fullscreen ${isReflexActive ? 'state-reflex' : winner ? 'state-winner' : 'state-idle'}`}>
      {/* Top toolbar */}
      <div className={`top-bar${presetsReady ? '' : ' top-bar--loading'}`}>
        <button className="settings-btn" onClick={openSettings} title="Edit player names">⚙</button>

        <div className="mode-toggle">
          <button className={`btn-mode ${gameMode === 'quiz'   ? 'active' : ''}`} onClick={() => socket.emit('setGameMode', { mode: 'quiz' })}>🎯 Quiz</button>
          <button className={`btn-mode ${gameMode === 'reflex' ? 'active' : ''}`} onClick={() => socket.emit('setGameMode', { mode: 'reflex' })}>⚡ Reflex</button>
        </div>

        <div className="top-bar-right">
          <div className={`master-controls${presetsReady ? '' : ' master-controls--loading'}`}>
            <button className="btn-master btn-master-idle" disabled={!presetsReady} onClick={() => socket.emit('wledIdle')} title="Set all buzzers to idle (breathing blue)">💤 Idle</button>
            <button
              className={`btn-master btn-master-toggle ${buzzersOn ? 'on' : 'off'}`}
              disabled={!presetsReady}
              onClick={() => {
                const next = !buzzersOn;
                setBuzzersOn(next);
                socket.emit('wledBrightness', { bri: next ? 128 : 0 });
              }}
              title="Toggle buzzer brightness on/off"
            >{buzzersOn ? '💡 On' : '🌑 Off'}</button>
            <button className="btn-master btn-master-press" disabled={!presetsReady} onClick={() => socket.emit('wledPress')} title="Trigger PRESS flash on all buzzers">⚡ Press</button>
          </div>
          <div className={`conn-dot ${connected ? 'online' : 'offline'}`}
               title={connected ? 'Server online' : 'Server offline'} />
        </div>
      </div>

      {isReflexActive ? (
        <div
          className="reflex-screen"
          style={{ backgroundColor: REFLEX_COLOR_MAP[reflexColor] ?? '#111111' }}
        >
          {reflexCountdown !== null && (
            <div className="reflex-countdown">{reflexCountdown}</div>
          )}
          {reflexPhase === 'go' && !reflexResult && (
            <div className="reflex-go">NOW!</div>
          )}
          <div className="reflex-live">
            {reflexBuzzes.map((b, i) => (
              <div key={b.id} className="reflex-buzz-item">
                <span className="reflex-pos">{['🥇','🥈','🥉','4️⃣'][i]}</span>
                <span className="reflex-name">{getPlayerName(b.id, nameMap)}</span>
                <span className="reflex-ms">+{b.ms}ms</span>
              </div>
            ))}
            {reflexFalseStarts.map(id => (
              <div key={id} className="reflex-false-start">
                ⚡ {getPlayerName(id, nameMap)} — false start
              </div>
            ))}
          </div>
          {reflexResult && (
            <div className="reflex-result">
              <h2>🏁 Results</h2>
              {reflexResult.awards.map(a => (
                <div key={a.id} className="reflex-award">
                  <span>{['🥇','🥈','🥉','4️⃣'][a.position - 1]} {getPlayerName(a.id, nameMap)}</span>
                  <span className={a.pts < 0 ? 'score-pts neg' : ''}>{a.multiplier}× = {a.pts >= 0 ? '+' : ''}{a.pts} pts</span>
                </div>
              ))}
              {reflexResult.falseStarts.length > 0 && (
                <div className="reflex-penalty">
                  {reflexResult.falseStarts.map(id => (
                    <div key={id}>⚡ {getPlayerName(id, nameMap)}: −{pointsStake} pts</div>
                  ))}
                </div>
              )}
            </div>
          )}
          {reflexPhase !== 'closed' && (
            <button className="btn-abort-reflex" onClick={() => socket.emit('abortReflex')}>Abort ✕</button>
          )}
        </div>
      ) : winner ? (
        <div className={`winner-screen ${verdict ? `verdict-${verdict}` : ''}`}>
          <div className="trophy">{verdict === 'correct' ? '✅' : verdict === 'wrong' ? '❌' : '🏆'}</div>
          <h1 className="winner-name">{getPlayerName(winner, nameMap)}</h1>
          <p className="winner-sub">FIRST TO BUZZ!</p>

          {/* Judge controls — hidden once verdict is in */}
          {!verdict && (
            <div className="judge-controls">
              <div className="points-row">
                <label className="points-label">± Points</label>
                <input
                  className="points-input"
                  type="number"
                  min="0"
                  value={pointsStake}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value));
                    setPointsStake(v);
                    socket.emit('setPoints', { points: v });
                  }}
                />
              </div>
              <div className="verdict-btns">
                <button className="btn-correct" onClick={() => handleJudge('correct')}>✅ Correct</button>
                <button className="btn-wrong"   onClick={() => handleJudge('wrong')}>❌ Wrong</button>
              </div>
              <button className="reset-btn" onClick={() => socket.emit('manualReset')}>
                Skip ↺
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="idle-screen">
          <div className="pulse-ring" />
          <h1>{presetsReady ? 'Ready…' : 'Setting up buzzers…'}</h1>
          {seenIds.length < 4 && <p className="idle-sub">Waiting for players to buzz in</p>}

          {gameMode === 'reflex' ? (
            <button className="btn-start-reflex" onClick={() => socket.emit('startReflex')}>
              🚦 Start Reflex Round
            </button>
          ) : (
            <div className="loop-btns">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  className={`btn-loop ${playingLoop === n ? 'active' : ''}`}
                  onClick={() => playLoop(n)}
                >
                  {playingLoop === n ? '⏹' : '▶'} Loop {n}
                </button>
              ))}
            </div>
          )}

          {/* Scoreboard — show as soon as any player has buzzed in */}
          {seenIds.length > 0 && (
            <div className="scoreboard">
              {seenIds
                .map((id) => [id, scores[id] ?? 0])
                .sort(([, a], [, b]) => b - a)
                .map(([id, pts]) => (
                  <div key={id} className={`score-row${presetsReady ? '' : ' score-row--loading'}`}>
                    <span className="score-name">{getPlayerName(id, nameMap)}</span>
                    {presetsReady
                      ? <span className={`score-pts ${pts < 0 ? 'neg' : ''}`}>{pts}</span>
                      : <span className="pts-spinner" aria-label="Loading…" />
                    }
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
