import { NextResponse } from "next/server";
import { MAX_MESSAGE_CHARS } from "@/game/negotiate";
import type { Difficulty } from "@/game/types";
import { lookup, negotiate, openingLine } from "@/server/negotiation";

const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];
const MAX_TURNS_IN_REQUEST = 30;

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/** POST {stageId, offerId, difficulty, transcript: [{role, text}], mode} → the landlord's next line + code-decided terms. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad("Body must be JSON");
  const { stageId, offerId, difficulty, transcript, mode } = body;
  const seed = Number.isSafeInteger(body.seed) ? (body.seed as number) : undefined;
  if (typeof stageId !== "string" || typeof offerId !== "string") return bad("stageId and offerId are required");
  if (!DIFFICULTIES.includes(difficulty as Difficulty)) return bad("difficulty must be easy, normal or hard");
  if (mode !== "auto" && mode !== "scripted") return bad("mode must be auto or scripted");
  if (!Array.isArray(transcript) || transcript.length === 0 || transcript.length > MAX_TURNS_IN_REQUEST) return bad("transcript must be a non-empty array");
  const turns = [];
  for (const t of transcript as Record<string, unknown>[]) {
    if ((t?.role !== "player" && t?.role !== "landlord") || typeof t.text !== "string" || !t.text.trim()) return bad("each turn needs role and text");
    turns.push({ role: t.role as "player" | "landlord", text: t.text.slice(0, MAX_MESSAGE_CHARS) });
  }
  if (turns.at(-1)!.role !== "player") return bad("last turn must be the player's");
  const result = await negotiate({ stageId, offerId, difficulty: difficulty as Difficulty, seed, transcript: turns, mode });
  if (!result) return bad("Unknown stage or offer");
  return NextResponse.json(result);
}

/** GET ?stageId&offerId → the landlord's name and scripted opening line (no hidden numbers). */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const seed = p.get("seed") === null ? undefined : Number(p.get("seed"));
  const found = lookup(p.get("stageId") ?? "", p.get("offerId") ?? "", Number.isSafeInteger(seed) ? seed : undefined);
  if (!found) return bad("Unknown stage or offer");
  return NextResponse.json({ landlord: found.cfg.landlord, opening: openingLine(found.facts, found.cfg), llmAvailable: !!process.env.GEMINI_API_KEY });
}
