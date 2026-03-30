// ── Shared UI configuration constants ────────────────────────────────────────
// Single source of truth — used by SettingsScreen, QuestionsEditor, i18n, etc.

export const SUPPORTED_LANGS = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
];

export const THEMES = [
  { value: 'default',    label: 'Default'    },
  { value: 'jungle',     label: 'Jungle'     },
  { value: 'rose',       label: 'Rosé'       },
  { value: 'rose-light', label: 'Rosé Light' },
  { value: 'crystal',    label: 'Crystal'    },
  { value: 'aurora',     label: 'Aurora'     },
];

// Scoreboard positions — labels are i18n keys (resolved at render time)
export const SCOREBOARD_POSITIONS = [
  { value: 'bottom',     labelKey: 'scoreboard_bottom'     },
  { value: 'top',        labelKey: 'scoreboard_top'        },
  { value: 'left',       labelKey: 'scoreboard_left'       },
  { value: 'right',      labelKey: 'scoreboard_right'      },
  { value: 'bar-bottom', labelKey: 'scoreboard_bar_bottom' },
  { value: 'bar-top',    labelKey: 'scoreboard_bar_top'    },
];
