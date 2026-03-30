import { useRef } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { IS_CONTROL } from '../utils/viewMode';

export default function VideoOverlay() {
  const playingVideo = useSessionStore(s => s.playingVideo);
  const videoRef = useRef(null);

  if (!playingVideo || IS_CONTROL) return null;

  return (
    <div className="video-overlay video-overlay--display">
      <video
        ref={videoRef}
        src={playingVideo}
        className="video-overlay__player"
        autoPlay
        controls
        onEnded={() => useSessionStore.setState({ playingVideo: null })}
      />
    </div>
  );
}
