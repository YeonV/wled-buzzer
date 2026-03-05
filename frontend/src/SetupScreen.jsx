import { useEffect, useState, useRef } from 'react';

const LS_ROSTER = 'buzzer-roster';

function loadRoster() {
  try { return JSON.parse(localStorage.getItem(LS_ROSTER) ?? '[]'); } catch { return []; }
}

/**
 * devices state shape:
 *   { [key]: { hexId: string|null, ip, name, active, wledName, fw, mac, buzzing } }
 *
 * key = hexId  when the device is connected to our MQTT broker (real chip ID, e.g. "475804")
 * key = 'ip:X.X.X.X'  for scan-only devices not yet on MQTT (no buzzing possible)
 *
 * Devices upgrade from ip: → hexId key when they connect to MQTT.
 */

function mergeDevice(prev, key, data) {
  return { ...prev, [key]: { ...(prev[key] ?? {}), ...data } };
}

// Upgrade a scan-only 'ip:X.X.X.X' entry to a real hexId entry
function upgradeIpKey(prev, ip, hexId, savedRoster) {
  const ipKey = `ip:${ip}`;
  if (!prev[ipKey]) return prev;
  const { [ipKey]: old, ...rest } = prev;
  const saved = savedRoster.find(r => r.hexId === hexId);
  return {
    ...rest,
    [hexId]: {
      ...old,
      hexId,
      ip,
      name:   saved?.name   ?? old.name   ?? '',
      active: saved?.active ?? old.active ?? false,
    },
  };
}

export default function SetupScreen({ socket, initialMqttMap = {}, onStart }) {
  const [devices, setDevices] = useState(() => {
    const saved = loadRoster();
    const map   = {};

    // Pre-populate from saved roster
    for (const r of saved) {
      map[r.hexId] = {
        hexId:    r.hexId,
        ip:       r.ip,
        name:     r.name,
        active:   r.active,
        wledName: '',
        fw:       '',
        mac:      '',
        buzzing:  false,
      };
    }

    // Merge in live MQTT map (devices already connected)
    for (const [hexId, ip] of Object.entries(initialMqttMap)) {
      if (map[hexId]) {
        map[hexId].ip = ip;
      } else {
        const saved_entry = saved.find(r => r.hexId === hexId);
        map[hexId] = {
          hexId,
          ip,
          name:     saved_entry?.name   ?? '',
          active:   saved_entry?.active ?? false,
          wledName: '',
          fw:       '',
          mac:      '',
          buzzing:  false,
        };
      }
    }

    return map;
  });

  const [scanning,  setScanning]  = useState(true);
  const [scanPct,   setScanPct]   = useState(0);
  const [mqttStatus, setMqttStatus] = useState({}); // { [ip]: 'idle'|'running'|'done'|'error' }
  const [mqttLog,    setMqttLog]    = useState({}); // { [ip]: string }
  const buzzTimers = useRef({});

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    socket.emit('discoverWleds');

    const savedRoster = loadRoster();
    const timers = buzzTimers.current;

    // Live MQTT map update — upgrades ip: entries to real hexId entries
    const onMqttMap = (rawMap) => {
      setDevices(prev => {
        let next = { ...prev };
        for (const [hexId, ip] of Object.entries(rawMap)) {
          next = upgradeIpKey(next, ip, hexId, savedRoster);
          if (!next[hexId]) {
            const saved = savedRoster.find(r => r.hexId === hexId);
            next[hexId] = {
              hexId,
              ip,
              name:     saved?.name   ?? '',
              active:   saved?.active ?? false,
              wledName: '',
              fw:       '',
              mac:      '',
              buzzing:  false,
            };
          } else {
            next[hexId] = { ...next[hexId], ip };
          }
        }
        return next;
      });
    };

    // Scan result — enrich existing entry by IP, or create scan-only entry
    const onFound = ({ ip, name: wledName, ver: fw, mac }) => {
      setDevices(prev => {
        const existing = Object.entries(prev).find(([, d]) => d.ip === ip);
        if (existing) {
          const [key] = existing;
          return mergeDevice(prev, key, { wledName: wledName ?? '', fw: fw ?? '', mac: mac ?? '' });
        }
        const key = `ip:${ip}`;
        return mergeDevice(prev, key, {
          hexId:    null,
          ip,
          name:     '',
          active:   false,
          wledName: wledName ?? '',
          fw:       fw       ?? '',
          mac:      mac      ?? '',
          buzzing:  false,
        });
      });
    };

    const onProgress = ({ done, total }) => setScanPct(Math.round((done / total) * 100));
    const onDone     = () => { setScanning(false); setScanPct(100); };

    // Physical button press during setup — highlight row + auto-tick active
    const onSetupBuzz = ({ id: hexId }) => {
      setDevices(prev => {
        const entry = prev[hexId] ?? {
          hexId,
          ip:       '',
          name:     '',
          active:   false,
          wledName: '',
          fw:       '',
          mac:      '',
          buzzing:  false,
        };
        return { ...prev, [hexId]: { ...entry, active: true, buzzing: true } };
      });
      clearTimeout(timers[hexId]);
      timers[hexId] = setTimeout(() => {
        setDevices(prev =>
          prev[hexId] ? { ...prev, [hexId]: { ...prev[hexId], buzzing: false } } : prev
        );
      }, 1500);
    };

    const onMqttProgress = ({ ip, msg })             => setMqttLog(prev    => ({ ...prev, [ip]: msg }));
    const onMqttDone     = ({ ip, clientId, brokerIp }) => {
      setMqttStatus(prev => ({ ...prev, [ip]: 'done' }));
      setMqttLog(prev    => ({ ...prev, [ip]: `✓ ${clientId} → ${brokerIp}` }));
    };
    const onMqttError    = ({ ip, msg })             => {
      setMqttStatus(prev => ({ ...prev, [ip]: 'error' }));
      setMqttLog(prev    => ({ ...prev, [ip]: `⚠ ${msg}` }));
    };

    socket.on('mqttClientIpMap',  onMqttMap);
    socket.on('wledFound',        onFound);
    socket.on('wledScanProgress', onProgress);
    socket.on('wledScanDone',     onDone);
    socket.on('setupBuzz',        onSetupBuzz);
    socket.on('wledMqttProgress', onMqttProgress);
    socket.on('wledMqttDone',     onMqttDone);
    socket.on('wledMqttError',    onMqttError);

    return () => {
      socket.off('mqttClientIpMap',  onMqttMap);
      socket.off('wledFound',        onFound);
      socket.off('wledScanProgress', onProgress);
      socket.off('wledScanDone',     onDone);
      socket.off('setupBuzz',        onSetupBuzz);
      socket.off('wledMqttProgress', onMqttProgress);
      socket.off('wledMqttDone',     onMqttDone);
      socket.off('wledMqttError',    onMqttError);
      Object.values(timers).forEach(clearTimeout);
    };
  }, [socket]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const setName      = (key, name)  => setDevices(prev => mergeDevice(prev, key, { name }));
  const toggleActive = (key)        => setDevices(prev => mergeDevice(prev, key, { active: !prev[key].active }));

  const rescan = () => {
    socket.emit('discoverWleds');
    setScanning(true);
    setScanPct(0);
  };

  const pushMqtt = (ip) => {
    if (!window.confirm(`⚠️ This will overwrite MQTT settings on ${ip} and reboot it.\nNo backup, no restore. Proceed?`)) return;
    setMqttStatus(prev => ({ ...prev, [ip]: 'running' }));
    setMqttLog(prev    => ({ ...prev, [ip]: 'Sending…' }));
    socket.emit('wledPushMqtt', { ip });
  };

  // Active buzzers = real hexId + ticked
  const activeBuzzers = Object.values(devices).filter(d => d.hexId && d.active);
  const canStart = activeBuzzers.length > 0;

  const handleStart = () => {
    const roster = activeBuzzers.map(({ hexId, ip, name }) => ({ hexId, ip, name }));
    // Persist full device state (including unticked) so we remember names on next open
    const full = Object.values(devices)
      .filter(d => d.hexId)
      .map(({ hexId, ip, name, active }) => ({ hexId, ip, name, active }));
    localStorage.setItem(LS_ROSTER, JSON.stringify(full));
    onStart(roster);
  };

  // ── Split into MQTT-known and scan-only ───────────────────────────────────
  const mqttDevices = Object.entries(devices).filter(([k])  => !k.startsWith('ip:'));
  const scanOnly    = Object.entries(devices).filter(([k])  =>  k.startsWith('ip:'));

  return (
    <div className="setup-screen">
      <div className="setup-frame">

      {/* ── Left panel: device table ─────────────────────────────────────── */}
      <div className="setup-left">
        <div className="setup-header">
          <h2>🎯 Buzzer Setup</h2>
          {scanning
            ? <span className="setup-scan-badge">📡 Scanning… {scanPct}%</span>
            : <button className="setup-rescan-btn" onClick={rescan}>📡 Rescan</button>
          }
        </div>

        <p className="setup-hint">
          Press a physical button to identify each buzzer — it will highlight and auto-select.
          Tick the ones you want to include in this game.
        </p>

        <table className="setup-table">
          <thead>
            <tr>
              <th title="Include in game">✓</th>
              <th>Player name</th>
              <th>IP</th>
              <th>WLED name</th>
              <th>Chip ID</th>
            </tr>
          </thead>
          <tbody>
            {mqttDevices.length === 0 && !scanning && (
              <tr>
                <td colSpan={5} className="setup-empty">
                  No WLED buzzers seen on MQTT yet.<br />
                  Make sure devices are powered on and connected to this broker.
                </td>
              </tr>
            )}

            {mqttDevices.map(([key, d]) => (
              <tr
                key={key}
                className={[
                  'setup-row',
                  d.buzzing ? 'setup-buzzing' : '',
                  d.active  ? 'setup-active'  : '',
                ].filter(Boolean).join(' ')}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={!!d.active}
                    onChange={() => toggleActive(key)}
                  />
                </td>
                <td>
                  <input
                    className="setup-name-input"
                    value={d.name}
                    placeholder={key.toUpperCase().slice(0, 6)}
                    onChange={(e) => setName(key, e.target.value)}
                  />
                </td>
                <td className="setup-ip">
                  {d.ip
                    ? <a href={`http://${d.ip}`} target="_blank" rel="noopener noreferrer">{d.ip}</a>
                    : <span className="setup-unknown">offline?</span>
                  }
                </td>
                <td className="setup-wled-name">{d.wledName || <span className="setup-unknown">—</span>}</td>
                <td className="setup-hex">{key}</td>
              </tr>
            ))}

            {scanOnly.length > 0 && (
              <tr className="setup-section-divider">
                <td colSpan={5}>
                  🔍 Found on network — not connected to MQTT
                  <span className="setup-divider-hint">(hijack to enrol)</span>
                </td>
              </tr>
            )}

            {scanOnly.map(([key, d]) => {
              const ms  = mqttStatus[d.ip] ?? 'idle';
              const log = mqttLog[d.ip];
              const active = ms === 'running' || ms === 'done';
              return (
                <tr key={key} className={`setup-row${active ? '' : ' setup-scan-only'}`}>
                  <td>
                    <button
                      className={`setup-hijack-btn setup-hijack-${ms}`}
                      disabled={ms === 'running'}
                      onClick={() => pushMqtt(d.ip)}
                      title="Overwrite MQTT config and reboot WLED — no backup"
                    >
                      {ms === 'idle'    && '💥 Hijack'}
                      {ms === 'running' && '⧗ Rebooting…'}
                      {ms === 'done'    && '✓ Hijacked'}
                      {ms === 'error'   && '⚠ Retry'}
                    </button>
                  </td>
                  <td className="setup-wled-name">{d.wledName || '—'}</td>
                  <td className="setup-ip">
                    {d.ip
                      ? <a href={`http://${d.ip}`} target="_blank" rel="noopener noreferrer">{d.ip}</a>
                      : '—'
                    }
                  </td>
                  <td className="setup-wled-name">{d.fw || '—'}</td>
                  <td className="setup-hex">{log ?? <span className="setup-unknown">no MQTT</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Right panel: start button ─────────────────────────────────────── */}
      <div className="setup-right">
        <div className="setup-right-inner">
          <div className="setup-logo">🎮</div>
          <h1 className="setup-title">Quiz Buzzer</h1>
          <ol className="setup-instructions">
            <li>Power on your WLED buzzers</li>
            <li>Press each button to identify it</li>
            <li>Name your players</li>
            <li>Hit <strong>Start Game</strong>!</li>
          </ol>

          {activeBuzzers.length > 0 && (
            <div className="setup-active-count">
              {activeBuzzers.length} buzzer{activeBuzzers.length !== 1 ? 's' : ''} ready
            </div>
          )}

          <button
            className={`setup-start-btn${canStart ? ' setup-start-ready' : ''}`}
            disabled={!canStart}
            onClick={handleStart}
          >
            {canStart ? '🚀 Start Game' : 'Select buzzers to start'}
          </button>

          {!canStart && (
            <p className="setup-tip">
              💡 Press a physical buzzer button to auto-select it
            </p>
          )}
        </div>
      </div>

      </div>
    </div>
  );
}
