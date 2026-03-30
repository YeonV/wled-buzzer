import { create } from 'zustand';
import { IS_CONTROL } from '../utils/viewMode';

// Audio element refs live here so any store action can trigger sounds
// without touching React component lifecycle.
let buzzerAudio    = null;
let correctAudio   = null;
let wrongAudio     = null;
let tickAudio      = null;
let timesupAudio   = null;
let loopAudio      = null;
let championAudio  = null;

export const useAudioStore = create((set, get) => ({
  playingLoop:   null,
  championPlaying: false,

  // ── Init (call once after first user interaction) ────────────────────
  initAudio() {
    buzzerAudio              = new Audio('/sounds/buzzer.mp3');    buzzerAudio.preload    = 'auto';
    correctAudio             = new Audio('/sounds/correct.mp3');   correctAudio.preload   = 'auto';
    wrongAudio               = new Audio('/sounds/wrong.mp3');     wrongAudio.preload     = 'auto';
    tickAudio                = new Audio('/sounds/tick.mp3');      tickAudio.preload      = 'auto';
    tickAudio.loop           = true;
    timesupAudio             = new Audio('/sounds/timesup.mp3');   timesupAudio.preload   = 'auto';
    loopAudio                = new Audio();                        loopAudio.loop         = true;
    championAudio            = new Audio('/sounds/champion.mp3');  championAudio.preload  = 'auto';
  },

  // ── Playback helpers ─────────────────────────────────────────────────
  playBuzz() {
    if (!buzzerAudio) return;
    buzzerAudio.currentTime = 0;
    buzzerAudio.play().catch(e => console.warn('Audio blocked:', e));
  },

  playTick() {
    if (!tickAudio) return;
    tickAudio.currentTime = 0;
    tickAudio.play().catch(e => console.warn('Audio blocked:', e));
  },

  stopTick() {
    if (!tickAudio) return;
    tickAudio.pause();
    tickAudio.currentTime = 0;
  },

  playVerdict(v) {
    get().stopTick();
    const audio = v === 'correct' ? correctAudio : wrongAudio;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(e => console.warn('Audio blocked:', e));
  },

  playTimesUp() {
    get().stopTick();
    if (!timesupAudio) return;
    timesupAudio.currentTime = 0;
    timesupAudio.play().catch(() => {});
  },

  stopLoop() {
    if (!loopAudio) return;
    loopAudio.pause();
    loopAudio.currentTime = 0;
    set({ playingLoop: null });
  },

  playLoop(n) {
    if (!loopAudio) return;
    const { playingLoop } = get();
    if (playingLoop === n) { get().stopLoop(); return; }
    loopAudio.pause();
    loopAudio.src = `/uploads/audio-system/loop${n}.mp3`;
    loopAudio.currentTime = 0;
    loopAudio.play().catch(e => console.warn('Audio blocked:', e));
    set({ playingLoop: n });
  },

  // Called by socket 'loopControl' event — syncs button state; only display plays audio
  syncLoopControl(n, isControl) {
    if (!n) {
      set({ playingLoop: null });
      if (!isControl) get().stopLoop();
      return;
    }
    set({ playingLoop: n });
    if (!isControl && loopAudio) {
      loopAudio.pause();
      loopAudio.src = `/uploads/audio-system/loop${n}.mp3`;
      loopAudio.currentTime = 0;
      loopAudio.play().catch(e => console.warn('Audio blocked:', e));
    }
  },

  // Champion fanfare (display only)
  playChampion() {
    if (!championAudio || IS_CONTROL) return;
    if (loopAudio) { loopAudio.pause(); loopAudio.currentTime = 0; }
    championAudio.loop = false;
    championAudio.currentTime = 0;
    const onEnded = () => {
      set({ championPlaying: false });
      championAudio.removeEventListener('ended', onEnded);
    };
    championAudio.addEventListener('ended', onEnded);
    championAudio.play()
      .then(() => set({ championPlaying: true }))
      .catch(() => set({ championPlaying: false }));
  },

  stopChampion() {
    if (!championAudio) return;
    championAudio.pause();
    championAudio.currentTime = 0;
    set({ championPlaying: false });
  },

  // Expose raw refs so FinalScreen / RoundHistoryScreen can stop champion on unmount
  getLoopAudio:     () => loopAudio,
  getChampionAudio: () => championAudio,
}));
