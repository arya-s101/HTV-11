import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("ElevenLabs host voice (server proxy)", () => {
  it("is off without a key, and the route answers 204 so the browser voice takes over", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const { POST, GET } = await import("../app/api/tts/route");
    expect(await (await GET()).json()).toEqual({ enabled: false, lastError: null });
    const res = await POST(new Request("http://x/api/tts", { method: "POST", body: JSON.stringify({ text: "Hello" }) }));
    expect(res.status).toBe(204);
    expect(f).not.toHaveBeenCalled();
  });
  it("calls ElevenLabs with the key server-side and caches repeated lines", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    const f = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      expect(url).toContain("api.elevenlabs.io/v1/text-to-speech/");
      expect(init.headers["xi-api-key"]).toBe("test-key");
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    vi.stubGlobal("fetch", f);
    const { synthesize } = await import("../server/tts");
    expect(new Uint8Array((await synthesize("Welcome to the show!"))!)).toEqual(new Uint8Array([1, 2, 3]));
    await synthesize("Welcome to the show!");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("a failed ElevenLabs call returns nothing (no error reaches the player)", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    const { synthesize } = await import("../server/tts");
    expect(await synthesize("Hello")).toBeNull();
  });
});

describe("ElevenLabs narrator (client)", () => {
  it("falls back to the browser voice when ElevenLabs isn't configured", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: false }))));
    vi.stubGlobal("document", { hidden: false, addEventListener: vi.fn() });
    const audio = await import("../components/audio");
    vi.spyOn(audio, "onUnlock").mockImplementation((cb: () => void) => (cb(), () => true));
    const { ElevenLabsNarrator } = await import("./ElevenLabsNarrator");
    const fallback = { isSupported: () => true, speakLines: vi.fn(async () => {}), speakOptions: vi.fn(async () => {}), cancel: vi.fn(), setSettings: vi.fn(), voices: () => [], sample: vi.fn(async () => {}), prefetch: vi.fn() };
    const n = new ElevenLabsNarrator(fallback);
    n.setSettings({ on: true, readOptions: true, voice: "", speed: "normal" });
    await n.speakLines(["Welcome!"]);
    expect(fallback.speakLines).toHaveBeenCalledWith(["Welcome!"], {});
    expect(n.usingRemote()).toBe(false);
  });
});
