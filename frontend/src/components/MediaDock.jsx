import { IS_CONTROL, IS_MODERATOR } from '../utils/viewMode';
import { useGameStore } from '../store/gameStore';
import LoopButtons  from './LoopButtons';
import VideoButtons from './VideoButtons';

export default function MediaDock() {
  const presetsReady = useGameStore(s => s.presetsReady);
  if (!IS_CONTROL || !presetsReady) return null;

  return (
    <div className={`loop-btns-dock${IS_MODERATOR ? ' loop-btns-dock--fixed' : ''}`}>
      <div className="loop-btns">
        <LoopButtons />
        <VideoButtons />
      </div>
    </div>
  );
}
