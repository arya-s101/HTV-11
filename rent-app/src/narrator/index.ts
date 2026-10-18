"use client";

// The app's one narrator plus its saved settings (PRD v5). Rounds use this module, never speechSynthesis.
import { useSyncExternalStore } from "react";
import { NARRATOR_DEFAULTS, type Narrator, type NarratorSettings } from "./Narrator";
import { ElevenLabsNarrator } from "./ElevenLabsNarrator";
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

/** The host's voice: ElevenLabs (via /api/tts) when configured, falling back to the browser voice, then silence. */
export function narrator(): Narrator {
  if (instance) return instance;
  load();
  if (typeof window === "undefined") return new NullNarrator();
  const browser = window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function" ? new WebSpeechNarrator(window.speechSynthesis) : new NullNarrator();
  instance = typeof window.Audio === "function" && typeof fetch === "function" ? new ElevenLabsNarrator(browser) : browser;
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

/** Whether the ElevenLabs voice is active (for the settings label). */
export const usingElevenLabs = () => (narrator() as { usingRemote?: () => boolean }).usingRemote?.() ?? false;
