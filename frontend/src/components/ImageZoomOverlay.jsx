import { useSessionStore } from '../store/sessionStore';
import { IS_CONTROL } from '../utils/viewMode';

/** Display-only fullscreen image overlay, triggered by moderator via socket */
export default function ImageZoomOverlay() {
  const zoomedImage = useSessionStore(s => s.zoomedImage);

  if (IS_CONTROL || !zoomedImage) return null;

  return (
    <div className="quiz-img-zoom-overlay">
      <img src={zoomedImage} alt="" className="quiz-img-zoom" />
    </div>
  );
}
