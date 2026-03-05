/**
 * WledDiscovery — isolated dev component
 *
 * Asks the backend to scan the local /24 subnet for WLED devices
 * by hitting GET /json/info on every IP. Results stream in as each
 * device responds. Nothing about the main game is touched.
 *
 * Mount anywhere:
 *   import WledDiscovery from './WledDiscovery';
 *   <WledDiscovery />
 */
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = `${window.location.protocol}//${window.location.hostname}:1303`;

export default function WledDiscovery({ onClose }) {
  const [devices,     setDevices]     = useState([]);   // [{ ip, name, ver, mac, ... }]
  const [scanning,    setScanning]    = useState(false);
  const [progress,    setProgress]    = useState(null); // { done, total }
  const [presetStatus, setPresetStatus] = useState({}); // { [ip]: 'idle'|'running'|'done'|'error' }
  const [presetLog,    setPresetLog]    = useState({}); // { [ip]: string } last status message
  const [mqttStatus,   setMqttStatus]   = useState({}); // { [ip]: 'idle'|'running'|'done'|'error' }
  const [mqttLog,      setMqttLog]      = useState({}); // { [ip]: string }
  const socketRef = useRef(null);

  // Own socket connection — doesn't share state with the main game
  useEffect(() => {
    const s = io(SOCKET_URL, { autoConnect: true });
    socketRef.current = s;

    s.on('wledFound', (device) => {
      setDevices((prev) => {
        if (prev.some((d) => d.ip === device.ip)) return prev;
        return [...prev, device];
      });
    });

    s.on('wledScanProgress', ({ done, total }) => {
      setProgress({ done, total });
    });

    s.on('wledScanDone', () => {
      setScanning(false);
      setProgress(null);
    });

    s.on('wledPresetProgress', ({ ip, step, total, msg }) => {
      setPresetLog(prev  => ({ ...prev, [ip]: `${step}/${total} — ${msg}` }));
    });
    s.on('wledPresetDone',  ({ ip }) => {
      setPresetStatus(prev => ({ ...prev, [ip]: 'done' }));
      setPresetLog(prev    => ({ ...prev, [ip]: 'All presets saved ✓' }));
    });
    s.on('wledPresetError', ({ ip, msg }) => {
      setPresetStatus(prev => ({ ...prev, [ip]: 'error' }));
      setPresetLog(prev    => ({ ...prev, [ip]: `Error: ${msg}` }));
    });

    s.on('wledMqttProgress', ({ ip, msg }) => {
      setMqttLog(prev => ({ ...prev, [ip]: msg }));
    });
    s.on('wledMqttDone', ({ ip, clientId, brokerIp }) => {
      setMqttStatus(prev => ({ ...prev, [ip]: 'done' }));
      setMqttLog(prev    => ({ ...prev, [ip]: `✓ ${clientId} → ${brokerIp}` }));
    });
    s.on('wledMqttError', ({ ip, msg }) => {
      setMqttStatus(prev => ({ ...prev, [ip]: 'error' }));
      setMqttLog(prev    => ({ ...prev, [ip]: `Error: ${msg}` }));
    });

    return () => s.disconnect();
  }, []);

  const startScan = () => {
    setDevices([]);
    setScanning(true);
    setProgress(null);
    setPresetStatus({});
    setPresetLog({});
    setMqttStatus({});
    setMqttLog({});
    socketRef.current?.emit('discoverWleds');
  };

  const pushPresets = (ip, name) => {
    setPresetStatus(prev => ({ ...prev, [ip]: 'running' }));
    setPresetLog(prev    => ({ ...prev, [ip]: 'Starting…' }));
    socketRef.current?.emit('wledSetupPresets', { ip, name });
  };

  const pushMqtt = (ip) => {
    if (!window.confirm(`⚠️ This will overwrite MQTT settings on ${ip} and reboot it.\nNo backup, no restore. Proceed?`)) return;
    setMqttStatus(prev => ({ ...prev, [ip]: 'running' }));
    setMqttLog(prev    => ({ ...prev, [ip]: 'Sending…' }));
    socketRef.current?.emit('wledPushMqtt', { ip });
  };

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.heading}>🔍 WLED Discovery</h2>
          <p style={styles.sub}>Scans the local /24 subnet for WLED devices via <code>/json/info</code></p>
        </div>
        {onClose && (
          <button style={styles.closeBtn} onClick={onClose} title="Back to settings">✕ Close</button>
        )}
      </div>

      <button
        style={{ ...styles.btn, ...(scanning ? styles.btnDisabled : {}) }}
        onClick={startScan}
        disabled={scanning}
      >
        {scanning ? 'Scanning…' : devices.length > 0 ? '↺ Rescan' : 'Start Scan'}
      </button>

      {scanning && progress && (
        <div style={styles.progressWrap}>
          <div style={{ ...styles.progressBar, width: `${pct}%` }} />
          <span style={styles.progressLabel}>{progress.done} / {progress.total}</span>
        </div>
      )}

      {!scanning && devices.length === 0 && progress === null && (
        <p style={styles.hint}>No scan run yet — press Start Scan.</p>
      )}

      {!scanning && devices.length === 0 && progress === null && (
        <></>
      )}

      {devices.length > 0 && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>IP</th>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Firmware</th>
              <th style={styles.th}>MAC</th>
              <th style={styles.th}>LEDs</th>
              <th style={styles.th}>Link</th>
              <th style={styles.th}>Presets</th>
              <th style={styles.th}>Preset status</th>
              <th style={styles.th}>MQTT</th>
              <th style={styles.th}>MQTT status</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => {
              const status = presetStatus[d.ip] ?? 'idle';
              const log    = presetLog[d.ip];
              return (
                <tr key={d.ip} style={styles.tr}>
                  <td style={styles.td}><code>{d.ip}</code></td>
                  <td style={styles.td}>{d.name ?? '—'}</td>
                  <td style={styles.td}>{d.ver ?? '—'}</td>
                  <td style={styles.td}><code>{d.mac ?? '—'}</code></td>
                  <td style={styles.td}>{d.leds?.count ?? '—'}</td>
                  <td style={styles.td}>
                    <a href={`http://${d.ip}`} target="_blank" rel="noopener noreferrer" style={styles.link}>
                      Open ↗
                    </a>
                  </td>
                  <td style={styles.td}>
                    <button
                      style={{
                        ...styles.presetBtn,
                        ...(status === 'running' ? styles.presetBtnRunning : {}),
                        ...(status === 'done'    ? styles.presetBtnDone    : {}),
                        ...(status === 'error'   ? styles.presetBtnError   : {}),
                      }}
                      disabled={status === 'running'}
                      onClick={() => pushPresets(d.ip, d.name)}
                    >
                      {status === 'idle'    && '⬇ Push'}
                      {status === 'running' && '⧗ Running…'}
                      {status === 'done'    && '✓ Done'}
                      {status === 'error'   && '⚠ Retry'}
                    </button>
                  </td>
                  <td style={{ ...styles.td, ...styles.statusCell }}>{log ?? '—'}</td>
                  <td style={styles.td}>
                    {(() => {
                      const ms = mqttStatus[d.ip] ?? 'idle';
                      return (
                        <>
                          <button
                            style={{
                              ...styles.presetBtn,
                              ...(ms === 'running' ? styles.presetBtnRunning : {}),
                              ...(ms === 'done'    ? styles.presetBtnDone    : {}),
                              ...(ms === 'error'   ? styles.presetBtnError   : {}),
                            }}
                            disabled={ms === 'running'}
                            onClick={() => pushMqtt(d.ip)}
                            title="Overwrite MQTT config and reboot. No backup."
                          >
                            {ms === 'idle'    && '💥 Hijack'}
                            {ms === 'running' && '⧗ Rebooting…'}
                            {ms === 'done'    && '✓ Done'}
                            {ms === 'error'   && '⚠ Retry'}
                          </button>
                        </>
                      );
                    })()}
                  </td>
                  <td style={{ ...styles.td, ...styles.statusCell }}>{mqttLog[d.ip] ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!scanning && devices.length === 0 && progress !== null && (
        <p style={styles.hint}>No WLED devices found on this subnet.</p>
      )}
    </div>
  );
}

// ── Inline styles (no CSS file dependency) ──────────────────────────────────
const styles = {
  container: {
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    background: '#0d0d1a',
    color: '#fff',
    minHeight: '100vh',
    padding: '2rem',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1.5rem',
  },
  closeBtn: {
    padding: '0.4rem 1rem',
    fontSize: '0.85rem',
    fontWeight: 700,
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.6)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  heading: {
    fontSize: '1.6rem',
    marginBottom: '0.25rem',
  },
  sub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '0.9rem',
    marginBottom: '1.5rem',
  },
  btn: {
    padding: '0.6rem 1.8rem',
    fontSize: '1rem',
    fontWeight: 700,
    borderRadius: '8px',
    border: '2px solid rgba(0,150,255,0.5)',
    background: 'rgba(0,120,255,0.12)',
    color: '#5ab0ff',
    cursor: 'pointer',
    marginBottom: '1.25rem',
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  progressWrap: {
    position: 'relative',
    height: '6px',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '999px',
    marginBottom: '0.5rem',
    overflow: 'hidden',
    width: '100%',
    maxWidth: '400px',
  },
  progressBar: {
    height: '100%',
    background: '#5ab0ff',
    transition: 'width 0.1s linear',
  },
  progressLabel: {
    position: 'absolute',
    top: '10px',
    left: 0,
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.4)',
  },
  hint: {
    color: 'rgba(255,255,255,0.35)',
    fontStyle: 'italic',
    marginTop: '1rem',
  },
  table: {
    marginTop: '1.5rem',
    borderCollapse: 'collapse',
    width: '100%',
    maxWidth: '1300px',
    fontSize: '0.9rem',
  },
  th: {
    textAlign: 'left',
    padding: '0.5rem 0.75rem',
    color: 'rgba(255,255,255,0.45)',
    fontWeight: 600,
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  tr: {
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  td: {
    padding: '0.5rem 0.75rem',
    verticalAlign: 'middle',
  },
  link: {
    color: '#5ab0ff',
    textDecoration: 'none',
    fontWeight: 600,
  },
  presetBtn: {
    padding: '0.25rem 0.65rem',
    fontSize: '0.8rem',
    fontWeight: 700,
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  presetBtnRunning: {
    opacity: 0.6,
    cursor: 'not-allowed',
    color: '#ffdd00',
    borderColor: 'rgba(255,220,0,0.4)',
  },
  presetBtnDone: {
    color: '#00e87a',
    borderColor: 'rgba(0,232,122,0.4)',
    background: 'rgba(0,200,100,0.08)',
  },
  presetBtnError: {
    color: '#ff6666',
    borderColor: 'rgba(255,80,80,0.4)',
    background: 'rgba(255,60,60,0.08)',
  },
  presetLog: {
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.45)',
  },
  statusCell: {
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.45)',
    maxWidth: '200px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};
