import { NextResponse } from "next/server";
import { generateRound, publicRound } from "@/lib/game/generate";
import { GameInputError, parseSeedRound } from "@/lib/game/request";
import { sources } from "@/lib/sources";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  try {
    const { seed, round } = parseSeedRound(params.get("seed"), params.get("round"));
    return NextResponse.json(publicRound(generateRound(seed, round, sources)));
  } catch (e) {
    if (e instanceof GameInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
