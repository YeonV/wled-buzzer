export const DISPLAY_ONLY_MODES = new Set(['text', 'intro', 'rules', 'config', 'video', 'standings']);

import { getPluginModeLabels } from '../plugins';

export const MODE_LABELS = {
  quiz: 'Quiz',
  hint: 'Hint',
  reflex: 'Reflex',
  precision: 'Precision',
  timer: 'Timer',
  itimer: 'I-Timer',
  elimination: 'Elimination',
  bomb: 'Bomb',
  ...getPluginModeLabels(),
};

export const answerText = (a) => (typeof a === 'string' ? a : (a?.text ?? ''));
export const answerImage = (a) => (typeof a === 'string' ? null : (a?.image?.trim() || null));
