import { NextResponse } from "next/server";
import { customCareer, presetCareer } from "@/server/career";

/**
 * POST {presetId} or {profession} → a story-only job path. Gemini writes it when configured; presets fall back to their
 * handwritten path and custom titles to a template.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { profession?: unknown; presetId?: unknown } | null;
  if (body && typeof body.presetId === "string") {
    const result = await presetCareer(body.presetId);
    return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: 400 });
  }
  if (!body || typeof body.profession !== "string") return NextResponse.json({ error: "presetId or profession is required" }, { status: 400 });
  const result = await customCareer(body.profession);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
