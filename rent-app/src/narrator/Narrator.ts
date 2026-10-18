// The read-aloud interface (PRD v5). Game code talks only to a Narrator; a better TTS provider later (Gemini TTS,
// ElevenLabs, pre-recorded audio) is a new class implementing this, with no changes to rounds or the show shell.
export interface NarratorSettings {
  on: boolean;
  readOptions: boolean;
  /** voiceURI of the chosen voice; empty = automatic (en-CA, then en-US, en-GB, any English; local voices first). */
  voice: string;
  speed: "slow" | "normal" | "fast";
}
export const NARRATOR_DEFAULTS: NarratorSettings = { on: true, readOptions: true, voice: "", speed: "normal" };
export const RATES: Record<NarratorSettings["speed"], number> = { slow: 0.85, normal: 1.05, fast: 1.25 };

export interface VoiceInfo {
  id: string;
  name: string;
  lang: string;
}

export interface Narrator {
  isSupported(): boolean;
  /** One utterance per line, in order. Resolves when done or cancelled; never rejects. */
  speakLines(lines: string[], opts?: { onLineStart?(i: number): void; onLineEnd?(i: number): void }): Promise<void>;
  /** "A: …", "B: …" for each option. */
  speakOptions(options: string[], opts?: { onOptionStart?(i: number): void }): Promise<void>;
  cancel(): void;
  setSettings(s: NarratorSettings): void;
  voices(): VoiceInfo[];
  /** Reads a short sample with the current settings ("Test voice"). */
  sample(): Promise<void>;
  /** Fetch these lines ahead of time (a network voice), so they play without a delay. No-op for local voices. */
  prefetch(lines: string[]): void;
}
