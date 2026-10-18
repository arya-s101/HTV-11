import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pronounce } from "./pronounce";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("pronunciation (PRD v5)", () => {
  it.each([
    ["Take the TTC", "Take the T T C"],
    ["CMHC average", "C M H C average"],
    ["Apply to the LTB", "Apply to the L T B"],
    ["Then call 311.", "Then call three one one."],
    ["$1,750", "one thousand seven hundred fifty dollars"],
    ["$1,750/mo", "one thousand seven hundred fifty dollars a month"],
    ["$1,050 a month", "one thousand fifty dollars a month"],
    ["$3.30 fare", "three dollars and thirty cents fare"],
    ["38.2%", "thirty-eight point two percent"],
    ["About 45 minutes", "About forty-five minutes"],
    ["Built in 1974", "Built in nineteen seventy-four"],
    ["Has A/C", "Has air conditioning"],
    ["$2,100/month + hydro", "two thousand one hundred dollars a month plus hydro"],
    ["$638M lost", "six hundred thirty-eight million dollars lost"],
  ])("%s → %s", (on, spoken) => expect(pronounce(on)).toBe(spoken));
  it("strips emoji and decorative symbols", () => {
    expect(pronounce("Receipt earned 📷 ✓ ▶ · done")).toBe("Receipt earned done");
  });
});

/** A fake speechSynthesis that never fires onend (the Chrome bug the safety timeout guards against). */
function stuckSynth() {
  const spoken: string[] = [];
  const synth = {
    speak: (u: { text: string; onstart?: () => void }) => {
      spoken.push(u.text);
      u.onstart?.();
    },
    cancel: vi.fn(),
    getVoices: () => [{ voiceURI: "v1", name: "Test", lang: "en-CA", localService: true }],
    addEventListener: vi.fn(),
  };
  class Utterance {
    text: string;
    constructor(t: string) {
      this.text = t;
    }
  }
  return { synth, Utterance, spoken };
}

describe("narrator", () => {
  it("never hangs if onend doesn't fire: the safety timeout moves on to the next line", async () => {
    vi.useFakeTimers();
    const { synth, Utterance, spoken } = stuckSynth();
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
    vi.stubGlobal("document", { hidden: false, addEventListener: vi.fn() });
    const audio = await import("../components/audio");
    vi.spyOn(audio, "onUnlock").mockImplementation((cb: () => void) => (cb(), () => true));
    const { WebSpeechNarrator } = await import("./WebSpeechNarrator");
    const n = new WebSpeechNarrator(synth as unknown as SpeechSynthesis);
    n.setSettings({ on: true, readOptions: true, voice: "", speed: "normal" });
    const starts: number[] = [];
    const p = n.speakLines(["First line.", "Second line."], { onLineStart: (i) => starts.push(i) });
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(starts).toEqual([0, 1]);
    expect(spoken.filter(Boolean)).toEqual(["First line.", "Second line."]);
  });
  it("without speech support the game gets a silent narrator and no read-aloud controls", async () => {
    vi.stubGlobal("window", { speechSynthesis: undefined, addEventListener: vi.fn() });
    const { narrator } = await import("./index");
    const n = narrator();
    expect(n.isSupported()).toBe(false);
    await expect(n.speakLines(["Hello."])).resolves.toBeUndefined();
  });
  it("no game code outside src/narrator references speechSynthesis", () => {
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))));
    walk("src");
    const offenders = files.filter((f) => !f.startsWith("src/narrator") && /\.(ts|tsx)$/.test(f) && /speechSynthesis/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
