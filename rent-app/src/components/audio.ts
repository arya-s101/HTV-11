"use client";

// Sound for the whole site (PRD v4 Change 1): on by default, two channels (music, sfx), music ducks under effects.
// Browsers block audio until a user gesture, so nothing is created or played before the first tap or key press.
// Effects are synthesised with Web Audio (no audio assets); music is public/music/theme.* if present.
import { useSyncExternalStore } from "react";

export interface AudioPrefs {
  muted: boolean;
  music: number; // 0..1
  sfx: number; // 0..1
}
// Music sits well under the effects: quiet bed, loud effects (feedback: effects must be clearly audible).
export const AUDIO_DEFAULTS: AudioPrefs = { muted: false, music: 0.12, sfx: 1 };
const KEY = "trd.audio.v2"; // v2: new, quieter music default; old saved levels are not reused
const DUCK = 0.25; // music level while an effect plays
const RESTORE_MS = 300;
const MUSIC_FILES = ["/music/theme.mp3", "/music/theme.ogg", "/music/theme.m4a", "/music/theme.wav"];

// ---------- preferences store ----------
let prefs: AudioPrefs = AUDIO_DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    prefs = {
      muted: typeof saved.muted === "boolean" ? saved.muted : AUDIO_DEFAULTS.muted,
      music: typeof saved.music === "number" ? clamp(saved.music) : AUDIO_DEFAULTS.music,
      sfx: typeof saved.sfx === "number" ? clamp(saved.sfx) : AUDIO_DEFAULTS.sfx,
    };
  } catch {
    // storage unavailable: defaults
  }
}
const clamp = (x: number) => Math.min(1, Math.max(0, x));
export function getAudioPrefs(): AudioPrefs {
  load();
  return prefs;
}
export function setAudioPrefs(patch: Partial<AudioPrefs>) {
  load();
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // not remembered
  }
  applyLevels();
  listeners.forEach((l) => l());
}
export function useAudioPrefs(): AudioPrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getAudioPrefs,
    () => AUDIO_DEFAULTS,
  );
}

// ---------- engine ----------
let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let music: HTMLAudioElement | null = null;
let musicFound: Promise<HTMLAudioElement | null> | null = null;
let duck = 1;
/** Speech can't go through Web Audio, so music ducks to ~30% while the narrator talks (PRD v5). */
let speechDuck = false;
const SPEECH_DUCK = 0.3;
let restoreTimer: ReturnType<typeof setTimeout> | undefined;
let restoreRaf = 0;
const unlockListeners = new Set<() => void>();

export const isUnlocked = () => ctx !== null;
export function onUnlock(cb: () => void): () => void {
  if (ctx) cb();
  unlockListeners.add(cb);
  return () => unlockListeners.delete(cb);
}

function applyLevels() {
  if (sfxBus) sfxBus.gain.value = prefs.muted ? 0 : prefs.sfx;
  if (music) {
    music.volume = prefs.muted ? 0 : clamp(prefs.music * Math.min(duck, speechDuck ? SPEECH_DUCK : 1));
    if (prefs.muted || prefs.music === 0) music.pause();
    else if (ctx && music.paused) music.play().catch(() => {});
  }
}

function findMusic(): Promise<HTMLAudioElement | null> {
  musicFound ??= (async () => {
    for (const src of MUSIC_FILES) {
      const res = await fetch(src, { method: "HEAD" }).catch(() => null);
      if (res?.ok && (res.headers.get("content-type") ?? "").startsWith("audio")) {
        const a = new Audio(src);
        a.loop = true;
        a.volume = 0;
        return a;
      }
    }
    return null;
  })();
  return musicFound;
}

/** Called once on the first user gesture: creates the audio context and starts music. */
function unlock() {
  if (ctx || typeof window === "undefined") return;
  try {
    ctx = new AudioContext();
    sfxBus = ctx.createGain();
    // A compressor keeps loud, overlapping effects from clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    sfxBus.connect(comp).connect(ctx.destination);
  } catch {
    return;
  }
  load();
  applyLevels();
  findMusic().then((a) => {
    music = a;
    applyLevels();
  });
  unlockListeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  const first = () => {
    unlock();
    window.removeEventListener("pointerdown", first, true);
    window.removeEventListener("keydown", first, true);
  };
  window.addEventListener("pointerdown", first, true);
  window.addEventListener("keydown", first, true);
}

/** Lowers music to 40% while an effect plays, then restores it over ~300ms. */
function duckFor(ms: number) {
  if (!music) return;
  cancelAnimationFrame(restoreRaf);
  clearTimeout(restoreTimer);
  duck = DUCK;
  applyLevels();
  restoreTimer = setTimeout(() => {
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / RESTORE_MS);
      duck = DUCK + (1 - DUCK) * k;
      applyLevels();
      if (k < 1) restoreRaf = requestAnimationFrame(step);
    };
    restoreRaf = requestAnimationFrame(step);
  }, ms);
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  if (!ctx || !sfxBus) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const t0 = ctx.currentTime + start;
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(sfxBus);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

// Effect gains are set so that, at default levels, effects sit clearly above the music.
const SOUNDS = {
  correct: () => (tone(784, 0, 0.12, "square", 0.58), tone(1175, 0.1, 0.24, "square", 0.58), 360),
  wrong: () => (tone(160, 0, 0.42, "sawtooth", 0.54, 110), 450),
  skip: () => (tone(660, 0, 0.08, "triangle", 0.54), tone(440, 0.08, 0.14, "triangle", 0.54), 240),
  roundStart: () => ([523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.16, "square", 0.5)), 450),
  reveal: () => {
    for (let t = 0; t < 0.5; t += 0.06) tone(95 + (t * 40), t, 0.05, "triangle", 0.6);
    return 550;
  },
  stat: () => (tone(988, 0, 0.35, "sine", 0.32), 350),
  report: () => ([523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.22, "square", 0.54)), 900),
  tap: () => (tone(1400, 0, 0.03, "square", 0.14), 40),
  joined: () => (tone(587, 0, 0.1, "square", 0.47), tone(880, 0.09, 0.18, "square", 0.47), 280),
} as const;
export type SoundId = keyof typeof SOUNDS;

/** Plays an effect if sound is on and audio has been unlocked by a gesture. Never throws. */
export function play(id: SoundId) {
  load();
  if (!ctx || prefs.muted || prefs.sfx === 0) return;
  try {
    if (ctx.state === "suspended") ctx.resume();
    const ms = SOUNDS[id]();
    if (id !== "tap") duckFor(ms);
  } catch {
    // audio is a nice-to-have
  }
}

/** Test hook: whether a music file was found (resolves after unlock). */
export const musicAvailable = () => findMusic().then((a) => !!a);

/** Narrator hook: hold music at ~30% while speaking; restore over ~300ms after. */
export function setSpeechDuck(on: boolean) {
  if (speechDuck === on) return;
  speechDuck = on;
  if (on || typeof requestAnimationFrame === "undefined") return applyLevels();
  const start = performance.now();
  const from = SPEECH_DUCK;
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / RESTORE_MS);
    if (music) music.volume = prefs.muted ? 0 : clamp(prefs.music * Math.min(duck, from + (1 - from) * k));
    if (k < 1 && !speechDuck) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
