import { NextResponse } from "next/server";
import { judge } from "@/lib/game/engine";
import { generateRound } from "@/lib/game/generate";
import { GameInputError, parseSeedRound } from "@/lib/game/request";
import { sources } from "@/lib/sources";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new GameInputError("Body must be JSON");
    const { seed, round } = parseSeedRound(body.seed, body.round);
    const streak = body.streak ?? 0;
    if (typeof streak !== "number" || !Number.isInteger(streak) || streak < 0 || streak > 100) {
      throw new GameInputError("streak must be a non-negative integer");
    }
    const r = generateRound(seed, round, sources);
    if (!r.listings.some((l) => l.id === body.listingId)) throw new GameInputError("listingId is not in this round");
    return NextResponse.json(judge(r.scenario, r.listings, body.listingId as string, streak));
  } catch (e) {
    if (e instanceof GameInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
