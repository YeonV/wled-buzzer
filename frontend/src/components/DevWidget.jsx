/* eslint-disable no-unused-vars */
import React, { useState } from 'react';

const groups = [
  {
    title: 'Small buttons',
    samples: [
      ['btn', 'btn--small'],
      ['btn', 'btn--small', 'btn--accent'],
      ['btn', 'btn--small', 'btn--ghost'],
    ],
  },
  {
    title: 'Buttons',
    samples: [
      ['btn'],
      ['btn', 'btn--accent'],
      ['btn', 'btn--ghost'],
      ['btn', 'btn--lift'],
      ['btn', 'btn--lift', 'btn--accent'],
      ['btn', 'btn--small', 'btn--lift', 'btn--accent'],
    ],
  },
  {
    title: 'Icons',
    samples: [
      ['btn', 'btn--icon'],
      ['btn', 'btn--icon', 'btn--accent'],
      ['btn', 'btn--icon', 'btn--ghost'],
      ['btn', 'btn--icon', 'btn--small'],
      ['btn', 'btn--icon', 'btn--small', 'btn--accent'],
      ['btn', 'btn--icon', 'btn--small', 'btn--ghost'],
      ['btn', 'btn--icon', 'btn--hover--accent', 'btn--ghost', 'btn--small'],
    ],
  },
  {
    title: 'Semantic colors (text & ghost)',
    samples: [
      ['btn', 'btn--info'],
      ['btn', 'btn--hover--info'],
      ['btn', 'btn--info', 'btn--ghost'],
      ['btn', 'btn--hover--info', 'btn--ghost'],

      ['btn', 'btn--error'],
      ['btn', 'btn--hover--error'],
      ['btn', 'btn--error', 'btn--ghost'],
      ['btn', 'btn--hover--error', 'btn--ghost'],

      ['btn', 'btn--success'],
      ['btn', 'btn--hover--success'],
      ['btn', 'btn--success', 'btn--ghost'],
      ['btn', 'btn--hover--success', 'btn--ghost'],

      ['btn', 'btn--accent'],
      ['btn', 'btn--hover--accent'],
      ['btn', 'btn--accent', 'btn--ghost'],
      ['btn', 'btn--hover--accent', 'btn--ghost'],
    ],
  },
  {
    title: 'Semantic colors (icons & hover tint)',
    samples: [
      ['btn', 'btn--info', 'btn--icon'],
      ['btn', 'btn--hover--info', 'btn--icon'],
      ['btn', 'btn--info', 'btn--ghost', 'btn--icon'],
      ['btn', 'btn--hover--info', 'btn--ghost', 'btn--icon'],

      ['btn', 'btn--error', 'btn--icon'],
      ['btn', 'btn--hover--error', 'btn--icon'],
      ['btn', 'btn--error', 'btn--ghost', 'btn--icon'],
      ['btn', 'btn--hover--error', 'btn--ghost', 'btn--icon'],

      ['btn', 'btn--success', 'btn--icon'],
      ['btn', 'btn--hover--success', 'btn--icon'],
      ['btn', 'btn--success', 'btn--ghost', 'btn--icon'],
      ['btn', 'btn--hover--success', 'btn--ghost', 'btn--icon'],

      ['btn', 'btn--accent', 'btn--icon'],
      ['btn', 'btn--hover--accent', 'btn--icon'],
      ['btn', 'btn--accent', 'btn--ghost', 'btn--icon'],
      ['btn', 'btn--hover--accent', 'btn--ghost', 'btn--icon'],
    ],
  },
  {
    title: 'Filled hover (legacy look)',
    samples: [
      ['btn', 'btn--hover--info-fill'],
      ['btn', 'btn--hover--info-fill', 'btn--ghost'],
      ['btn', 'btn--hover--error-fill'],
      ['btn', 'btn--hover--error-fill', 'btn--ghost'],
      ['btn', 'btn--hover--success-fill'],
      ['btn', 'btn--hover--success-fill', 'btn--ghost'],
      ['btn', 'btn--hover--accent-fill'],
      ['btn', 'btn--hover--accent-fill', 'btn--ghost'],
      ['btn', 'btn--hover--error-fill', 'btn--icon'],
      ['btn', 'btn--hover--success-fill', 'btn--icon'],
    ],
  },
  {
    title: 'Combined examples',
    samples: [
      ['btn', 'btn--small', 'btn--icon', 'btn--hover--accent'],
      ['btn', 'btn--small', 'btn--icon', 'btn--hover--accent', 'btn--ghost'],
      ['btn', 'btn--lift', 'btn--accent'],
      ['btn', 'btn--lift', 'btn--hover--success'],
      ['btn', 'btn--small', 'btn--hover--error-fill'],
    ],
  },
];

function cls(arr) { return arr.join(' '); }

export default function DevWidget() {
  const [copiedIdx, setCopiedIdx] = useState(null);

  const handleCopy = async (text, idx) => {
    if (!navigator?.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1400);
    } catch (e) {
      // ignore
    }
  };

  return (
    <div className="dev-widget">
      <h4 className="dev-widget-title">Button styles preview (click button to copy class)</h4>
      {groups.map((g, gi) => (
        <div className="dev-sample-group" key={gi}>
          <div className="dev-sample-grid-items">
            {(() => {
              const textSamples = g.samples.filter(s => !s.includes('btn--icon'));
              const iconSamples = g.samples.filter(s => s.includes('btn--icon'));
              const colsPerSide = 4; // left 4 = text, right 4 = icons
              const textRows = Math.ceil(Math.max(1, textSamples.length) / colsPerSide);
              const iconRows = Math.ceil(Math.max(1, iconSamples.length) / colsPerSide);
              const rows = Math.max(textRows, iconRows);
              const totalCells = rows * colsPerSide * 2; // rows * 8
              const cells = Array(totalCells).fill(null);

              // place text samples in left 4 columns
              textSamples.forEach((s, idx) => {
                const row = Math.floor(idx / colsPerSide);
                const col = idx % colsPerSide;
                const gridIndex = row * colsPerSide * 2 + col; // row*8 + col
                cells[gridIndex] = s;
              });

              // place icon samples in right 4 columns
              iconSamples.forEach((s, idx) => {
                const row = Math.floor(idx / colsPerSide);
                const col = idx % colsPerSide;
                const gridIndex = row * colsPerSide * 2 + colsPerSide + col; // row*8 + 4 + col
                cells[gridIndex] = s;
              });

              return cells.map((s, i) => {
                const idx = `${gi}-${i}`;
                if (!s) return <div className="dev-sample-item" key={idx} />;
                const txt = s.join(' ');
                const isIcon = s.includes('btn--icon');
                return (
                  <div className="dev-sample-item" key={idx}>
                    <button
                      type="button"
                      className={cls(s)}
                      aria-label={txt}
                      title={txt}
                      onClick={() => handleCopy(txt, idx)}
                    >
                      {copiedIdx === idx ? 'Copied' : (isIcon ? '★' : 'Button')}
                    </button>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      ))}
    </div>
  );
}
