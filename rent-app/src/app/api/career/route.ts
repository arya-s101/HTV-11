import { NextResponse } from "next/server";
import { customCareer } from "@/server/career";

/** POST {profession} → a story-only job path for a custom profession (Gemini when configured, else a template). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { profession?: unknown } | null;
  if (!body || typeof body.profession !== "string") return NextResponse.json({ error: "profession is required" }, { status: 400 });
  const result = await customCareer(body.profession);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
