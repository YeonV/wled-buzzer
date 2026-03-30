import { useEffect } from 'react';
import { useAudioStore }   from '../store/audioStore';
import { useQuizStore }    from '../store/quizStore';
import { useSessionStore } from '../store/sessionStore';
import { registerSocketListeners } from '../services/socketBridge';
import { fetchLoops, fetchLoopNames, fetchVideos, fetchPacks } from '../services/api';
import { BACKEND_URL } from '../utils/viewMode';
import { useI18n } from '../i18n';
import socket from '../services/socket';

/**
 * Runs all one-time startup side-effects:
 *  - audio element creation
 *  - data fetching (questions, sets, loops)
 *  - socket event registration
 */
export function useAppInit() {
  const { switchLang } = useI18n();
  // Data + audio — no cleanup needed, grouped into one effect
  useEffect(() => {
    useAudioStore.getState().initAudio();
    useQuizStore.getState().fetchQuestions();
    useQuizStore.getState().fetchQuestionSets();
    fetchLoops()
      .then(nums => { if (Array.isArray(nums) && nums.length > 0) useSessionStore.setState({ availableLoops: nums }); })
      .catch(() => {});
    fetchLoopNames()
      .then(names => { if (names && typeof names === 'object') useSessionStore.setState({ loopNames: names }); })
      .catch(() => {});
    fetchVideos()
      .then(files => useSessionStore.setState({ availableVideos: Array.isArray(files) ? files : [] }))
      .catch(() => {});
    fetchPacks(BACKEND_URL)
      .then(({ active }) => { if (active?.avatars) useSessionStore.setState({ activeAvatarPack: active.avatars }); })
      .catch(() => {});
  }, []);

  // Socket bridge — separate because it returns a cleanup function
  useEffect(() => registerSocketListeners(), []);

  // Lang sync — routes socket 'lang' event to i18n context (needs switchLang from hook)
  useEffect(() => {
    const handler = (d) => switchLang(d.lang);
    socket.on('lang', handler);
    return () => socket.off('lang', handler);
  }, [switchLang]);
}
