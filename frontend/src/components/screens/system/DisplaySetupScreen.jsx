import { useEffect, useState, useRef } from 'react';
import { Gamepad2 } from 'lucide-react';
import BuzzerCard from '../../BuzzerCard';
import { useGameStore } from '../../../store/gameStore';
import { useSetupStore } from '../../../store/setupStore';
import socket from '../../../services/socket';
import { PALETTE } from '../../../utils/setupHelpers';

function getAccentColor() {
  try {
    const val = getComputedStyle(document.documentElement).getPropertyValue('--c-accent') || '';
    const v = val.trim();
    if (v) return v;
  } catch { /* empty */ }
  return PALETTE[0];
}

// ── Same lean device helpers as SetupScreen ────────────────────────────────
function mergeDevice(prev, key, data) {
  return { ...prev, [key]: { ...(prev[key] ?? {}), ...data } };
}

export default function DisplaySetupScreen() {
  const initialMqttMap = useGameStore(s => s.mqttClientIpMap);

  const [devices, setDevices] = useState(() => {
    const map = {};
    for (const [hexId, ip] of Object.entries(initialMqttMap)) {
      map[hexId] = { hexId, ip, name: '', wledName: '', buzzing: false };
    }
    return map;
  });

  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [activeMap,     setActiveMap]     = useState({}); // { hexId: boolean }
  const [colorMap,      setColorMap]      = useState({}); // { hexId: { useIndividual, color } }
  const [aliasMap,      setAliasMap]      = useState({}); // { primaryHexId: string[] }
  const buzzTimers = useRef({});

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const timers = buzzTimers.current;

    const onMqttMap = (rawMap) => {
      setDevices(prev => {
        let next = { ...prev };
        for (const [hexId, ip] of Object.entries(rawMap)) {
          const ipKey = `ip:${ip}`;
          const ipEntry = next[ipKey];
          // Carry over wledName from scan-only ip: entry when device upgrades to hexId
          const wledName = ipEntry?.wledName ?? next[hexId]?.wledName ?? '';
          if (ipEntry) { const { [ipKey]: _drop, ...rest } = next; next = rest; }
          next[hexId] = { ...(next[hexId] ?? { name: '', buzzing: false }), hexId, ip, wledName };
        }
        return next;
      });
    };

    const onFound = ({ ip, name: wledName }) => {
      setDevices(prev => {
        const entry = Object.entries(prev).find(([, d]) => d.ip === ip);
        if (entry) return mergeDevice(prev, entry[0], { wledName: wledName ?? '' });
        // scan-only — not yet on MQTT, just track for display
        const key = `ip:${ip}`;
        return mergeDevice(prev, key, { hexId: null, ip, name: '', wledName: wledName ?? '', buzzing: false });
      });
    };

    const onSetupBuzz = ({ id: hexId }) => {
      setDevices(prev => ({
        ...prev,
        [hexId]: { ...(prev[hexId] ?? { ip: '', name: '', wledName: '' }), hexId, buzzing: true },
      }));
      clearTimeout(timers[hexId]);
      timers[hexId] = setTimeout(() => {
        setDevices(prev =>
          prev[hexId] ? { ...prev, [hexId]: { ...prev[hexId], buzzing: false } } : prev
        );
      }, 1500);
    };

    const onWledName = ({ hexId, wledName }) =>
      setDevices(prev => prev[hexId] ? mergeDevice(prev, hexId, { wledName }) : prev);

    const onActiveToggle = ({ hexId, active }) =>
      setActiveMap(prev => ({ ...prev, [hexId]: active }));

    const onNameChange = ({ hexId, name }) =>
      setDevices(prev => prev[hexId] ? mergeDevice(prev, hexId, { name }) : prev);

    const onSnapshot = (snapshot) => {
      setDevices(prev => {
        let next = { ...prev };
        for (const [hexId, { name, wledName, icon }] of Object.entries(snapshot)) {
          if (next[hexId]) {
            next[hexId] = { ...next[hexId], ...(name ? { name } : {}), ...(wledName ? { wledName } : {}), ...(icon !== undefined ? { icon } : {}) };
          }
        }
        return next;
      });
      setActiveMap(prev => {
        const next = { ...prev };
        for (const [hexId, { active }] of Object.entries(snapshot)) {
          next[hexId] = active;
        }
        return next;
      });
      setColorMap(prev => {
        const next = { ...prev };
        for (const [hexId, { color, useIndividual }] of Object.entries(snapshot)) {
          if (color !== undefined) next[hexId] = { color, useIndividual: !!useIndividual };
        }
        useSetupStore.getState().setColorMap(next);
        return next;
      });
      setAliasMap(prev => {
        const next = { ...prev };
        for (const [hexId, { aliases }] of Object.entries(snapshot)) {
          if (Array.isArray(aliases)) next[hexId] = aliases;
        }
        return next;
      });
    };

    const onIconChange = ({ hexId, icon }) =>
      setDevices(prev => prev[hexId] ? mergeDevice(prev, hexId, { icon }) : prev);

    const onColorChange = ({ hexId, color, useIndividual }) =>
      setColorMap(prev => {
        const next = { ...prev, [hexId]: { color, useIndividual: !!useIndividual } };
        useSetupStore.getState().setColorMap(next);
        return next;
      });

    const onAliasChange = ({ hexId, aliases }) =>
      setAliasMap(prev => ({ ...prev, [hexId]: aliases ?? [] }));

    socket.on('mqttClientIpMap',   onMqttMap);
    socket.on('wledFound',         onFound);
    socket.on('setupBuzz',         onSetupBuzz);
    socket.on('setupWledName',     onWledName);
    socket.on('setupActiveToggle', onActiveToggle);
    socket.on('setupNameChange',   onNameChange);
    socket.on('setupIconChange',   onIconChange);
    socket.on('setupColorChange',  onColorChange);
    socket.on('setupAliasChange',  onAliasChange);
    socket.on('setupSnapshot',     onSnapshot);

    return () => {
      socket.off('mqttClientIpMap',   onMqttMap);
      socket.off('wledFound',         onFound);
      socket.off('setupBuzz',         onSetupBuzz);
      socket.off('setupWledName',     onWledName);
      socket.off('setupActiveToggle', onActiveToggle);
      socket.off('setupNameChange',   onNameChange);
      socket.off('setupIconChange',   onIconChange);
      socket.off('setupColorChange',  onColorChange);
      socket.off('setupAliasChange',  onAliasChange);
      socket.off('setupSnapshot',     onSnapshot);
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  // ── Audio unlock on first click anywhere ──────────────────────────────────
  const handleUnlock = () => {
    if (audioUnlocked) return;
    // Create + immediately discard a silent oscillator — satisfies the browser gesture requirement
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.001);
    } catch { /* ignore */ }
    setAudioUnlocked(true);
  };

  // ── Sorted device list (MQTT-known first, scan-only after) ────────────────
  const allAliasIds = new Set(Object.values(aliasMap).flat());
  const mqttList = Object.values(devices).filter(d => d.hexId && !allAliasIds.has(d.hexId));
  const scanList = Object.values(devices).filter(d => !d.hexId);
  const allDisplay = [...mqttList, ...scanList];

  const noDevices = allDisplay.length === 0;

  return (
    <div className="display-setup" onClick={handleUnlock}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="display-setup__header">
        <Gamepad2 size={28} strokeWidth={1.5} />
        <span>WLED Buzzer</span>
      </div>

      {/* ── Buzzer stage ──────────────────────────────────────────────── */}
      <div className="display-setup__stage">
        {noDevices ? (
          <p className="display-setup__empty">
            Scanning for buzzers…
          </p>
        ) : (
            allDisplay.map((d) => {
            // const name   = d.name || d.wledName || d.hexId || d.ip || '???';
            // const online = !!d.ip;
            const colEntry = d.hexId ? colorMap[d.hexId] : null;
              const color = colEntry?.useIndividual ? colEntry.color : getAccentColor();
            const aliases = d.hexId ? (aliasMap[d.hexId] ?? []) : [];
            const dimmed = d.hexId && d.hexId in activeMap && !activeMap[d.hexId];
            return (
              <div
                key={d.hexId ?? d.ip}
                className="buzzer-cluster"
                style={{ opacity: dimmed ? 0.25 : 1, transition: 'opacity 0.4s ease' }}
              >
                <BuzzerCard device={d} aliases={aliases.map(id => devices[id]).filter(Boolean)} color={color} size={160} />
              </div>
            );
          })
        )}
      </div>

      {/* ── Status bar ────────────────────────────────────────────────── */}
      <div className="display-setup__status">
        Waiting for host to start the game…
      </div>

      {/* ── Audio unlock hint (fades out once clicked) ────────────────── */}
      <div className={`display-setup__audio-hint${audioUnlocked ? ' display-setup__audio-hint--done' : ''}`}>
        {audioUnlocked ? '🔊 Audio enabled' : '🔇 Click anywhere to enable audio'}
      </div>

    </div>
  );
}
