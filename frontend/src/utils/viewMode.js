export const BACKEND_URL = window.location.origin;

const view = new URLSearchParams(window.location.search).get('view');
export const IS_MASTER = view === 'master';
export const IS_MODERATOR = view === 'moderator';
export const IS_CONTROL = IS_MASTER || IS_MODERATOR;
export const IS_SCOREBOARD = view === 'scoreboard';
