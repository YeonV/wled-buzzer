import { Play, X, Trophy, Skull } from 'lucide-react';
import { getPlayerName } from '../../../utils/player';
import ReflexScreen from './ReflexScreen';
import { useI18n } from '../../../i18n';
import { useGameStore } from '../../../store/gameStore';
import { useSessionStore } from '../../../store/sessionStore';
import { IS_CONTROL } from '../../../utils/viewMode';
import socket from '../../../services/socket';
import { useShallow } from 'zustand/shallow';

export default function SurvivorScreen() {
  const { survivorPhase, survivorDone, survivorRound, survivorEliminated, reflexPhase } = useGameStore(
    useShallow(({ survivorPhase, survivorDone, survivorRound, survivorEliminated, reflexPhase }) =>
      ({ survivorPhase, survivorDone, survivorRound, survivorEliminated, reflexPhase }))
  );
  const nameMap = useSessionStore(s => s.nameMap);
  const isControl = IS_CONTROL;
  const { t } = useI18n();
  return (
    <div className="survivor-screen">
      {survivorPhase === 'done' && survivorDone && (
        <div className="survivor-winner">
          <div className="trophy"><Trophy /></div>
          <h1 className="winner-name">{getPlayerName(survivorDone, nameMap)}</h1>
          <p className="winner-sub">{t('survivor_sole')}</p>
        </div>
      )}
      {survivorPhase === 'playing' && (
        <>
          <div className="survivor-header"><Trophy size={28} /> {t('survivor_header', survivorRound)}</div>
          <div className="survivor-status">
            {survivorEliminated.length > 0 && (
              <div className="survivor-eliminated">
                <span><Skull size={14} /> {t('survivor_eliminated')}</span>
                {survivorEliminated.map(id => (
                  <span key={id} className="survivor-elim-name">{getPlayerName(id, nameMap)}</span>
                ))}
              </div>
            )}
          </div>
          {reflexPhase !== 'idle' && (
            <ReflexScreen style={{ position: 'relative', flex: '1 1 0' }} />
          )}
          {isControl && reflexPhase === 'idle' && survivorRound > 0 && (
            <button id="start-reflex" className="btn btn--accent" style={{ marginTop: '1.5rem' }} onClick={() => socket.emit('survivorNextRound')}>
              <Play size={15} /> {t('next_round')}
            </button>
          )}
        </>
      )}
      {isControl && (
        <button className="btn btn--error" onClick={() => socket.emit('abortSurvivor')}>{t('abort')} <X size={13} /></button>
      )}
    </div>
  );
}
