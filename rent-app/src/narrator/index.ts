"use client";

// The app's one narrator plus its saved settings (PRD v5). Rounds use this module, never speechSynthesis.
import { useSyncExternalStore } from "react";
import { NARRATOR_DEFAULTS, type Narrator, type NarratorSettings } from "./Narrator";
import { NullNarrator } from "./NullNarrator";
import { WebSpeechNarrator } from "./WebSpeechNarrator";

const KEY = "trd.narrator";
let instance: Narrator | null = null;
let settings: NarratorSettings = NARRATOR_DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    settings = {
      on: typeof s.on === "boolean" ? s.on : NARRATOR_DEFAULTS.on,
      readOptions: typeof s.readOptions === "boolean" ? s.readOptions : NARRATOR_DEFAULTS.readOptions,
      voice: typeof s.voice === "string" ? s.voice : "",
      speed: ["slow", "normal", "fast"].includes(s.speed) ? s.speed : "normal",
    };
  } catch {
    // defaults
  }
}

/** The Web Speech narrator when the browser has speech, otherwise a silent stand-in. */
export function narrator(): Narrator {
  if (instance) return instance;
  load();
  instance = typeof window !== "undefined" && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function" ? new WebSpeechNarrator(window.speechSynthesis) : new NullNarrator();
  instance.setSettings(settings);
  return instance;
}

export function getNarratorSettings(): NarratorSettings {
  load();
  return settings;
}
export function setNarratorSettings(patch: Partial<NarratorSettings>) {
  load();
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // not remembered
  }
  narrator().setSettings(settings);
  listeners.forEach((l) => l());
}
export function useNarratorSettings(): NarratorSettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getNarratorSettings,
    () => NARRATOR_DEFAULTS,
  );
}

/** Whether read-aloud can work here (speech API present and an English voice loaded). Re-checked after voices load. */
export function useNarratorSupported(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const t = setTimeout(cb, 2100);
      return () => clearTimeout(t);
    },
    () => (typeof window === "undefined" ? false : narrator().isSupported()),
    () => false,
  );
}

export type { Narrator, NarratorSettings } from "./Narrator";
