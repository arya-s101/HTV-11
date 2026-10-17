"use client";

// Game-show settings (PRD v2 §5.10): text speed, skip animations, sound effects (muted by default),
// plus the OS reduced-motion preference. Also a tiny Web Audio sound kit, so there are no audio assets.
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type TextSpeed = "slow" | "normal" | "fast" | "instant";

export interface ShowSettings {
  textSpeed: TextSpeed;
  skipAnimations: boolean;
  sound: boolean;
  /** Stat cards after answers (PRD v3 Change 4). */
  showStats: boolean;
  /** Stat card auto-advance; the demo preset shortens it. Not saved. */
  statMs: number;
  /** From prefers-reduced-motion: movement becomes fades; no shake or flashing. */
  reducedMotion: boolean;
}

interface Ctx extends ShowSettings {
  set: (patch: Partial<Omit<ShowSettings, "reducedMotion" | "statMs">>) => void;
  /** No movement at all: either the OS asks for it or the player skipped animations. */
  still: boolean;
}

const KEY = "trd.show";
const DEFAULTS: ShowSettings = { textSpeed: "normal", skipAnimations: false, sound: false, showStats: true, statMs: 5000, reducedMotion: false };
const SettingsCtx = createContext<Ctx | null>(null);

export const CHAR_MS: Record<TextSpeed, number> = { slow: 55, normal: 28, fast: 10, instant: 0 };
export const LINE_PAUSE_MS: Record<TextSpeed, number> = { slow: 1500, normal: 900, fast: 350, instant: 0 };

export function ShowSettingsProvider({ children, initial }: { children: React.ReactNode; initial?: Partial<ShowSettings> }) {
  const [s, setS] = useState<ShowSettings>({ ...DEFAULTS, ...initial });
  useEffect(() => {
    try {
      const { textSpeed, skipAnimations, sound, showStats } = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      const saved = Object.fromEntries(Object.entries({ textSpeed, skipAnimations, sound, showStats }).filter(([, v]) => v !== undefined));
      setS((cur) => ({ ...cur, ...saved, ...initial }));
    } catch {
      // storage unavailable: use defaults
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setS((cur) => ({ ...cur, reducedMotion: mq.matches }));
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const value = useMemo<Ctx>(
    () => ({
      ...s,
      still: s.reducedMotion || s.skipAnimations,
      set: (patch) =>
        setS((cur) => {
          const next = { ...cur, ...patch };
          try {
            localStorage.setItem(KEY, JSON.stringify({ textSpeed: next.textSpeed, skipAnimations: next.skipAnimations, sound: next.sound, showStats: next.showStats }));
          } catch {
            // ignore
          }
          return next;
        }),
    }),
    [s],
  );
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): Ctx {
  const c = useContext(SettingsCtx);
  if (!c) throw new Error("useSettings outside ShowSettingsProvider");
  return c;
}

// ---------- sound effects ----------
let audio: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") audio.resume();
    return audio;
  } catch {
    return null;
  }
}
function tone(freq: number, start: number, dur: number, type: OscillatorType, gain = 0.06) {
  const a = ctx();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.02);
}
export const sfx = {
  chime: () => {
    tone(784, 0, 0.12, "square");
    tone(1175, 0.1, 0.22, "square");
  },
  buzzer: () => tone(130, 0, 0.45, "sawtooth", 0.05),
  drum: (ms: number) => {
    for (let t = 0; t < ms / 1000; t += 0.06) tone(90 + Math.random() * 20, t, 0.05, "triangle", 0.05);
  },
  pop: () => tone(660, 0, 0.06, "square", 0.04),
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.2, "square", 0.05)),
};

export function useSfx() {
  const { sound } = useSettings();
  return useMemo(
    () =>
      Object.fromEntries(
        Object.entries(sfx).map(([k, fn]) => [
          k,
          (...args: never[]) => {
            if (sound) (fn as (...a: never[]) => void)(...args);
          },
        ]),
      ) as typeof sfx,
    [sound],
  );
}
