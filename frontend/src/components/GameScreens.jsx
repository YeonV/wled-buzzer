import { Zap, Target, Bomb, Signal, Trophy, Ruler, Handshake } from 'lucide-react';
import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useI18n } from '../i18n';
import { IS_CONTROL } from '../utils/viewMode';
import socket from '../services/socket';
import { useShallow } from 'zustand/shallow';

export default function GameScreens() {
  const { gameMode, precisionTarget, bombDuration } = useGameStore(
    useShallow(({ gameMode, precisionTarget, bombDuration }) => ({ gameMode, precisionTarget, bombDuration }))
  );
  const { t } = useI18n();

  if (!IS_CONTROL) return null;

  if (gameMode === 'reflex') return (
    <button id="start-reflex" className="btn btn--accent" onClick={() => socket.emit('startReflex')}>
      <Zap size={16} /> {t('start_reflex')}
    </button>
  );

  if (gameMode === 'precision') return (
    <div className="idle-mode-config">
      <div className="mode-config-row">
        <label className="points-label">{t('target_time')}</label>
        <input className="points-input" type="number" min="1" max="30"
          value={precisionTarget / 1000}
          onChange={(e) => { const ms = Math.max(1000, Math.min(30000, Number(e.target.value) * 1000)); useGameStore.setState({ precisionTarget: ms }); socket.emit('setPrecisionTarget', { ms }); }} />
        <span className="points-label">{t('seconds')}</span>
      </div>
      <button id="start-reflex" className="btn btn--accent" onClick={() => socket.emit('startPrecision')}>
        <Target size={16} /> {t('start_precision')}
      </button>
    </div>
  );

  if (gameMode === 'elimination') return (
    <div className="idle-mode-config">
      <p className="idle-sub">{t('elim_idle_hint')}</p>
      <button id="start-reflex" className="btn btn--accent" style={{ borderColor: '#ff8800', color: '#ff8800' }} onClick={() => socket.emit('startElimination')}>
        <Bomb size={16} /> {t('open_elimination')}
      </button>
    </div>
  );

  if (gameMode === 'bomb') return (
    <div className="idle-mode-config">
      <div className="mode-config-row">
        <label className="points-label">{t('fuse_length')}</label>
        <input className="points-input" type="number" min="3" max="60"
          value={bombDuration / 1000}
          onChange={(e) => { const ms = Math.max(3000, Math.min(60000, Number(e.target.value) * 1000)); useGameStore.setState({ bombDuration: ms }); socket.emit('setBombDuration', { ms }); }} />
        <span className="points-label">{t('seconds')}</span>
      </div>
      <button id="start-reflex" className="btn btn--accent" style={{ borderColor: '#ff4444', color: '#ff4444' }} onClick={() => socket.emit('startBomb')}>
        <Signal size={16} /> {t('light_fuse')}
      </button>
    </div>
  );

  if (gameMode === 'survivor') return (
    <div className="idle-mode-config">
      <p className="idle-sub">{t('survivor_idle_hint')}</p>
      <button id="start-reflex" className="btn btn--accent" style={{ borderColor: '#ffd700', color: '#ffd700' }} onClick={() => socket.emit('startSurvivor')}>
        <Trophy size={16} /> {t('start_survivor')}
      </button>
    </div>
  );

  if (gameMode === 'estimate') return <EstimateIdleConfig t={t} />;
  if (gameMode === 'dilemma') return (
    <div className="idle-mode-config">
      <button id="start-reflex" className="btn btn--accent" style={{ borderColor: '#a855f7', color: '#a855f7' }}
        onClick={() => socket.emit('startDilemma', { rounds: 6, diplomacyAfterRound: 3, diplomacyDuration: 60 })}>
        <Handshake size={16} /> {t('start_dilemma')}
      </button>
    </div>
  );

  return null;
}

function EstimateIdleConfig({ t }) {
  const [correctValue, setCorrectValue] = useState(0);
  const [unit, setUnit] = useState('');
  return (
    <div className="idle-mode-config">
      <div className="mode-config-row">
        <label className="points-label">{t('estimate_correct')}</label>
        <input className="points-input" type="number" value={correctValue} onChange={e => setCorrectValue(Number(e.target.value))} />
      </div>
      <div className="mode-config-row">
        <label className="points-label">Unit</label>
        <input className="points-input" type="text" value={unit} style={{ width: '4rem' }} onChange={e => setUnit(e.target.value)} />
      </div>
      <button id="start-reflex" className="btn btn--accent" style={{ borderColor: '#ff9900', color: '#ff9900' }}
        onClick={() => socket.emit('startEstimate', { correctValue, unit, inputType: 'manual' })}>
        <Ruler size={16} /> {t('start_estimate')}
      </button>
    </div>
  );
}
