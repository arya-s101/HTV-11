import { NextResponse } from "next/server";
import { allowTts, lastTtsError, synthesize, ttsEnabled } from "@/server/tts";

/** GET → whether ElevenLabs is configured (the client falls back to the browser voice if not), plus the last error. */
export async function GET() {
  return NextResponse.json({ enabled: ttsEnabled(), lastError: lastTtsError });
}

/** POST {text} → audio/mpeg of the host saying it. 204 when unavailable, so the client falls back silently. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim() || text.length > 600) return NextResponse.json({ error: "text is required (max 600 chars)" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!ttsEnabled() || !allowTts(ip)) return new NextResponse(null, { status: 204 });
  const audio = await synthesize(text);
  if (!audio) return new NextResponse(null, { status: 204 });
  return new NextResponse(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" } });
}
