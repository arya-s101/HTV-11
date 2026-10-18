// ElevenLabs narrator: the host's voice comes from /api/tts (ElevenLabs, key server-side). Every line of a screen
// is fetched in parallel and played in order; clips are cached. If ElevenLabs isn't configured or a clip fails,
// that line falls back to the browser voice (WebSpeechNarrator), so the game never goes quiet or waits.
import { getAudioPrefs, onUnlock, setSpeechDuck } from "../components/audio";
import { NARRATOR_DEFAULTS, RATES, type Narrator, type NarratorSettings, type VoiceInfo } from "./Narrator";
import { pronounce } from "./pronounce";

const LETTERS = "ABCDEFGH";
const SAMPLE = "Hi, I'm Dominic ToRento. Welcome to The Lease You Can Do!";

export class ElevenLabsNarrator implements Narrator {
  private settings: NarratorSettings = NARRATOR_DEFAULTS;
  private gen = 0;
  private unlocked = false;
  private current: HTMLAudioElement | null = null;
  private clips = new Map<string, Promise<string | null>>();
  /** True once /api/tts says ElevenLabs is configured. */
  private remote = false;
  private ready: Promise<boolean>;
  /** The lines being read now; options wait for them, so the host never talks over himself. */
  private busy: Promise<void> = Promise.resolve();

  constructor(private fallback: Narrator) {
    this.ready = fetch("/api/tts")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => (this.remote = !!d.enabled))
      .catch(() => false);
    onUnlock(() => (this.unlocked = true));
    document.addEventListener("visibilitychange", () => document.hidden && this.cancel());
  }

  /** Whether the ElevenLabs voice is in use (vs. the browser fallback). */
  usingRemote() {
    return this.remote;
  }
  isSupported() {
    return this.remote || this.fallback.isSupported();
  }
  voices(): VoiceInfo[] {
    return this.remote ? [] : this.fallback.voices();
  }
  setSettings(s: NarratorSettings) {
    this.settings = s;
    this.fallback.setSettings(s);
    if (!s.on) this.cancel();
  }

  private canSpeak() {
    return this.unlocked && this.settings.on && !getAudioPrefs().muted;
  }

  /** Two clip requests at a time (ElevenLabs limits concurrency); the rest wait their turn, still ahead of playback. */
  private inFlight = 0;
  private queue: (() => void)[] = [];
  private async limited<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inFlight >= 2) await new Promise<void>((r) => this.queue.push(r));
    this.inFlight++;
    try {
      return await fn();
    } finally {
      this.inFlight--;
      this.queue.shift()?.();
    }
  }

  /** One cached clip per line of text: an object URL, or null if ElevenLabs couldn't make it. */
  private clip(text: string): Promise<string | null> {
    const spoken = pronounce(text);
    let p = this.clips.get(spoken);
    if (!p) {
      p = this.limited(() => fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: spoken }) }))
        .then(async (r) => {
          if (r.status === 200) return URL.createObjectURL(await r.blob());
          console.warn(`Host voice: no clip for "${spoken.slice(0, 40)}" (${r.status}); see /api/tts for the last ElevenLabs error.`);
          return null;
        })
        .catch(() => null);
      p.then((url) => !url && this.clips.delete(spoken)); // let a failed line retry next time
      this.clips.set(spoken, p);
    }
    return p;
  }

  /** Plays one clip; resolves on end, error, cancel, or a safety timeout if the end event never comes. */
  private play(url: string, gen: number, onStart?: () => void): Promise<void> {
    return new Promise((resolve) => {
      if (gen !== this.gen) return resolve();
      const a = new Audio(url);
      a.playbackRate = RATES[this.settings.speed];
      this.current = a;
      let done = false;
      let safety = setTimeout(() => finish(), 15_000);
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(safety);
        setSpeechDuck(false);
        if (this.current === a) this.current = null;
        resolve();
      };
      a.onloadedmetadata = () => {
        clearTimeout(safety);
        safety = setTimeout(finish, (a.duration / a.playbackRate) * 1000 + 1500);
      };
      a.onplaying = () => {
        setSpeechDuck(true);
        onStart?.();
      };
      a.onended = finish;
      a.onerror = finish;
      a.onpause = () => a.ended || finish();
      a.play().catch(finish);
    });
  }

  /** Speaks lines in order, with every clip already requested so there's no gap between lines. */
  private async run(texts: string[], gen: number, onStart: (i: number) => void, onEnd: (i: number) => void) {
    const clips = texts.map((t) => this.clip(t));
    for (let i = 0; i < texts.length && gen === this.gen; i++) {
      const url = await clips[i];
      if (gen !== this.gen) return;
      if (url) await this.play(url, gen, () => onStart(i));
      else await this.fallback.speakLines([texts[i]], { onLineStart: () => onStart(i) });
      if (gen === this.gen) onEnd(i);
    }
  }

  async speakLines(lines: string[], opts: { onLineStart?(i: number): void; onLineEnd?(i: number): void } = {}) {
    const gen = ++this.gen;
    this.stop();
    const job = (async () => {
      await this.ready;
      if (gen !== this.gen || !this.canSpeak()) return;
      if (!this.remote) return this.fallback.speakLines(lines, opts);
      await this.run(lines, gen, (i) => opts.onLineStart?.(i), (i) => opts.onLineEnd?.(i));
    })();
    this.busy = job;
    await job;
  }

  prefetch(lines: string[]) {
    void this.ready.then((ok) => ok && lines.forEach((l) => void this.clip(l)));
  }

  async speakOptions(options: string[], opts: { onOptionStart?(i: number): void } = {}) {
    const gen = this.gen;
    await this.busy; // let the question finish first
    await this.ready;
    if (gen !== this.gen || !this.canSpeak() || !this.settings.readOptions) return;
    if (!this.remote) return this.fallback.speakOptions(options, opts);
    await this.run(
      options.map((o, i) => `${LETTERS[i]}: ${o}`),
      gen,
      (i) => opts.onOptionStart?.(i),
      () => {},
    );
    if (gen === this.gen) opts.onOptionStart?.(-1);
  }

  private stop() {
    if (this.current) {
      this.current.onpause = null;
      this.current.pause();
      this.current = null;
    }
    this.fallback.cancel();
    setSpeechDuck(false);
  }

  cancel() {
    this.gen++;
    this.stop();
  }

  async sample() {
    this.unlocked = true;
    await this.speakLines([SAMPLE]);
  }
}
