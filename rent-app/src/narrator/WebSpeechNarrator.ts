// Web Speech API narrator (PRD v5): the browser's built-in speechSynthesis. No key, no cost, no network needed.
// The only place in the app that touches speechSynthesis.
import { getAudioPrefs, onUnlock, setSpeechDuck } from "../components/audio";
import { NARRATOR_DEFAULTS, RATES, type Narrator, type NarratorSettings, type VoiceInfo } from "./Narrator";
import { pronounce } from "./pronounce";

const LETTERS = "ABCDEFGH";
const LANG_ORDER = ["en-CA", "en-US", "en-GB"];

export class WebSpeechNarrator implements Narrator {
  private synth: SpeechSynthesis;
  private settings: NarratorSettings = NARRATOR_DEFAULTS;
  private list: SpeechSynthesisVoice[] = [];
  private gen = 0;
  /** Chrome can garbage-collect an utterance mid-sentence (it stops and onend never fires): hold a reference. */
  private live = new Set<SpeechSynthesisUtterance>();
  /** Chrome clips an utterance spoken right after cancel(); wait this long after a cancel before speaking. */
  private lastCancel = 0;
  private unlocked = false;
  private loaded: Promise<void>;

  constructor(synth: SpeechSynthesis) {
    this.synth = synth;
    this.loaded = this.loadVoices();
    // Some browsers only allow speech after a user gesture: speak a silent utterance at the moment audio unlocks.
    onUnlock(() => {
      this.unlocked = true;
      try {
        const u = new SpeechSynthesisUtterance("");
        u.volume = 0;
        this.synth.speak(u);
      } catch {
        // speech is optional
      }
    });
    // Browsers pause and resume speech in hidden tabs unpredictably: stop instead.
    document.addEventListener("visibilitychange", () => document.hidden && this.cancel());
  }

  private loadVoices(): Promise<void> {
    return new Promise((resolve) => {
      const take = () => {
        this.list = this.synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
        if (this.list.length) resolve();
      };
      take();
      if (this.list.length) return;
      this.synth.addEventListener?.("voiceschanged", take);
      setTimeout(resolve, 2000); // give up waiting; isSupported() then reflects what loaded
    });
  }

  isSupported() {
    return this.list.length > 0;
  }
  voices(): VoiceInfo[] {
    return this.list.map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang }));
  }
  setSettings(s: NarratorSettings) {
    this.settings = s;
    if (!s.on) this.cancel();
  }

  /** Chosen voice, else en-CA → en-US → en-GB → any English, preferring local (offline, low-latency) voices. */
  private voice(): SpeechSynthesisVoice | null {
    const chosen = this.list.find((v) => v.voiceURI === this.settings.voice);
    if (chosen) return chosen;
    const rank = (v: SpeechSynthesisVoice) => {
      const i = LANG_ORDER.indexOf(v.lang.replace("_", "-"));
      return (i < 0 ? LANG_ORDER.length : i) * 2 + (v.localService ? 0 : 1);
    };
    return [...this.list].sort((a, b) => rank(a) - rank(b))[0] ?? null;
  }

  private canSpeak() {
    return this.unlocked && this.settings.on && !getAudioPrefs().muted && this.list.length > 0;
  }

  /** One utterance; resolves on end, error or cancel, or after a safety timeout if onend never fires. */
  private async say(text: string, gen: number, onStart?: () => void): Promise<void> {
    const since = Date.now() - this.lastCancel;
    if (since < 250) await new Promise((r) => setTimeout(r, 250 - since));
    return new Promise((resolve) => {
      const spoken = pronounce(text);
      if (!spoken || gen !== this.gen) return resolve();
      const u = new SpeechSynthesisUtterance(spoken);
      const v = this.voice();
      if (v) u.voice = v;
      u.lang = v?.lang ?? "en-CA";
      u.rate = RATES[this.settings.speed];
      u.pitch = 1;
      u.volume = 1;
      let done = false;
      this.live.add(u);
      const finish = () => {
        if (done) return;
        done = true;
        this.live.delete(u);
        clearTimeout(safety);
        setSpeechDuck(false);
        resolve();
      };
      const safety = setTimeout(finish, spoken.length * 90 + 1500);
      u.onstart = () => {
        setSpeechDuck(true);
        onStart?.();
      };
      u.onend = finish;
      u.onerror = finish;
      this.synth.speak(u);
    });
  }

  async speakLines(lines: string[], opts: { onLineStart?(i: number): void; onLineEnd?(i: number): void } = {}) {
    // Claim this turn before waiting for voices, so a cancel during loading really cancels.
    const gen = ++this.gen;
    await this.loaded;
    if (gen !== this.gen || !this.canSpeak()) return;
    if (this.synth.speaking || this.synth.pending) {
      this.synth.cancel(); // clear any stuck queue before a new question
      this.lastCancel = Date.now();
    }
    for (let i = 0; i < lines.length && gen === this.gen; i++) {
      await this.say(lines[i], gen, () => opts.onLineStart?.(i));
      if (gen === this.gen) opts.onLineEnd?.(i);
    }
  }

  async speakOptions(options: string[], opts: { onOptionStart?(i: number): void } = {}) {
    await this.loaded;
    if (!this.canSpeak() || !this.settings.readOptions) return;
    const gen = this.gen;
    for (let i = 0; i < options.length && gen === this.gen; i++) await this.say(`${LETTERS[i]}: ${options[i]}`, gen, () => opts.onOptionStart?.(i));
    if (gen === this.gen) opts.onOptionStart?.(-1);
  }

  cancel() {
    this.gen++;
    try {
      if (this.synth.speaking || this.synth.pending) {
        this.synth.cancel();
        this.lastCancel = Date.now();
      }
    } catch {
      // nothing to stop
    }
    setSpeechDuck(false);
  }

  prefetch() {
    // local voices need no fetching
  }

  /** Reads a sample with the current settings (the "Test voice" button). */
  async sample() {
    this.unlocked = true;
    this.cancel();
    const gen = this.gen;
    await this.say(`Hi, I'm Dominic ToRento. Rent's listed at $1,750/mo, plus hydro.`, gen);
  }
}
