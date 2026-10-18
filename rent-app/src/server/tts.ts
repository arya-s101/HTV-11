// SERVER-ONLY ElevenLabs text-to-speech (PRD v5 provider swap). The key never leaves the server.
// Env: ELEVENLABS_API_KEY (required), ELEVENLABS_VOICE_ID and ELEVENLABS_MODEL (optional).
import "server-only";

const DEFAULT_VOICE = "pNInz6obpgDQGcFmaJgB"; // ElevenLabs premade voice; override with ELEVENLABS_VOICE_ID
const DEFAULT_MODEL = "eleven_flash_v2_5"; // lowest latency
const TIMEOUT_MS = 8000;
const MAX_CHARS = 400;
const CACHE_MAX = 400;

export const ttsEnabled = () => !!process.env.ELEVENLABS_API_KEY;

// Lines repeat a lot (host intros, options), so cache audio in memory: fewer calls, less latency, less quota.
const cache = new Map<string, ArrayBuffer>();

// ElevenLabs limits concurrent requests per account (only a few on smaller plans); more fail with 429.
// So at most MAX_CONCURRENT calls run at once, the rest queue, and a busy answer is retried with backoff.
const MAX_CONCURRENT = 2;
let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** The last ElevenLabs failure, shown by GET /api/tts to help diagnose a silent host. */
export let lastTtsError: string | null = null;

export async function synthesize(text: string): Promise<ArrayBuffer | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  if (!key || !clean) return null;
  const hit = cache.get(clean);
  if (hit) return hit;
  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await slot(() => call(key, voice, clean));
    if (out === "busy") {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    if (out) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(clean, out);
      lastTtsError = null;
    }
    return out;
  }
  return null;
}

async function call(key: string, voice: string, clean: string): Promise<ArrayBuffer | null | "busy"> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: clean, model_id: process.env.ELEVENLABS_MODEL || DEFAULT_MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } }),
    });
    if (res.status === 429) {
      lastTtsError = `429 ${(await res.text().catch(() => "")).slice(0, 200)}`;
      return "busy";
    }
    if (!res.ok) {
      lastTtsError = `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
      return null;
    }
    return await res.arrayBuffer();
  } catch (e) {
    lastTtsError = e instanceof Error ? e.message : "request failed";
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---------- rate limit (in memory, per IP) ----------
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 400;
const hits = new Map<string, { n: number; since: number }>();
export function allowTts(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.since > WINDOW_MS) {
    hits.set(ip, { n: 1, since: now });
    return true;
  }
  if (h.n >= MAX_PER_WINDOW) return false;
  h.n++;
  return true;
}
