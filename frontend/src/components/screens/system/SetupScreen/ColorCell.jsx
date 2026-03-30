import { useState, useEffect } from 'react';
import { RotateCw, Paintbrush } from 'lucide-react';
import { useSetupStore } from '../../../../store/setupStore';
import { PALETTE } from '../../../../utils/setupHelpers';
import socket from '../../../../services/socket';

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

export default function ColorCell({ id, index }) {
  const colorMap = useSetupStore(s => s.colorMap);
  const devices  = useSetupStore(s => s.devices);
  const setColor = useSetupStore(s => s.setColor);
  const resetColor = useSetupStore(s => s.resetColor);
  const toggleIndividual = useSetupStore(s => s.toggleIndividual);
  const colEntry = colorMap[id] ?? { useIndividual: false, color: PALETTE[index % PALETTE.length] };
  const ip = devices[id]?.ip;

  const [pushState, setPushState] = useState('idle'); // idle | sending | done | error

  useEffect(() => {
    const onDone  = (d) => { if (d.ip === ip) setPushState('done');  };
    const onError = (d) => { if (d.ip === ip) setPushState('error'); };
    socket.on('setIdleColorDone',  onDone);
    socket.on('setIdleColorError', onError);
    return () => {
      socket.off('setIdleColorDone',  onDone);
      socket.off('setIdleColorError', onError);
    };
  }, [ip]);

  // Auto-reset feedback after 2s
  useEffect(() => {
    if (pushState === 'done' || pushState === 'error') {
      const t = setTimeout(() => setPushState('idle'), 2000);
      return () => clearTimeout(t);
    }
  }, [pushState]);

  const pushIdleColor = () => {
    if (!ip) return;
    setPushState('sending');
    socket.emit('setIdleColor', { ip, color: hexToRgb(colEntry.color) });
  };

  return (
    <div>
      <label className="setup-color-toggle" title="Use individual colour">
        <input type="checkbox" checked={!!colEntry.useIndividual} onChange={() => toggleIndividual(id, PALETTE[index % PALETTE.length])} />
        <span className="setup-color-toggle__track" />
      </label>
      {colEntry.useIndividual && (
        <>
          <input
            type="color"
            className="setup-color-picker"
            value={colEntry.color}
            onChange={e => setColor(id, e.target.value)}
          />
          <button className="setup-color-reset" title="Reset colour" onClick={() => resetColor(id, PALETTE[index % PALETTE.length])}>
            <RotateCw size={14} />
          </button>
          {ip && (
            <button
              className={`setup-color-reset${pushState === 'done' ? ' setup-color-push--done' : pushState === 'error' ? ' setup-color-push--error' : ''}`}
              title="Set as WLED idle colour"
              disabled={pushState === 'sending'}
              onClick={pushIdleColor}
            >
              {pushState === 'sending' ? '...' : pushState === 'done' ? '✓' : pushState === 'error' ? '!' : <Paintbrush size={14} />}
            </button>
          )}
        </>
      )}
    </div>
  );
}
