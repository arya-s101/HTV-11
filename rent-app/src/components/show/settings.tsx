"use client";

// Game-show settings (PRD v2 §5.10): text speed, skip animations, stat cards, plus the OS reduced-motion preference.
// Sound lives in src/components/audio.ts (PRD v4 Change 1: on by default, shared with the navbar).
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type TextSpeed = "slow" | "normal" | "fast" | "instant";

export interface ShowSettings {
  textSpeed: TextSpeed;
  skipAnimations: boolean;
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
const DEFAULTS: ShowSettings = { textSpeed: "normal", skipAnimations: false, showStats: true, statMs: 5000, reducedMotion: false };
const SettingsCtx = createContext<Ctx | null>(null);

export const CHAR_MS: Record<TextSpeed, number> = { slow: 55, normal: 28, fast: 10, instant: 0 };
export const LINE_PAUSE_MS: Record<TextSpeed, number> = { slow: 1500, normal: 900, fast: 350, instant: 0 };

export function ShowSettingsProvider({ children, initial }: { children: React.ReactNode; initial?: Partial<ShowSettings> }) {
  const [s, setS] = useState<ShowSettings>({ ...DEFAULTS, ...initial });
  useEffect(() => {
    try {
      const { textSpeed, skipAnimations, showStats } = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      const saved = Object.fromEntries(Object.entries({ textSpeed, skipAnimations, showStats }).filter(([, v]) => v !== undefined));
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
            localStorage.setItem(KEY, JSON.stringify({ textSpeed: next.textSpeed, skipAnimations: next.skipAnimations, showStats: next.showStats }));
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
