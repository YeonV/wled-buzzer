import socket from '../services/socket';
import { useSessionStore } from '../store/sessionStore';
import { IS_CONTROL } from '../utils/viewMode';

export default function QuizImage({ src, className, position }) {
  if (!src?.trim()) return null;

  const posClass = position ? ` quiz-img--${position}` : '';

  const handleClick = IS_CONTROL
    ? () => {
        const current = useSessionStore.getState().zoomedImage;
        socket.emit('imageZoom', { src: current === src ? null : src });
      }
    : undefined;

  return (
    <img
      src={src} alt=""
      className={`quiz-img${className ? ` ${className}` : ''}${posClass}`}
      onClick={handleClick}
      style={IS_CONTROL ? { cursor: 'zoom-in' } : undefined}
    />
  );
}
