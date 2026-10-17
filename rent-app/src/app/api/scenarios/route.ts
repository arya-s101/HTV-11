import { NextResponse } from "next/server";
import type { ScenarioRequestItem } from "@/game/questions";
import { sanitizeScenarioProfile } from "@/game/profile";
import { allow, writeScenarios } from "@/server/scenarios";

/**
 * POST {items:[{id, kind}], profile?, session?, room?} → {items: {id: {scenario, host_line}}, source}.
 * Briefs come from the reviewed templates on the server (the client only names them). Never blocks the game:
 * on any problem it answers 200 with no items, and the client uses its reviewed fallbacks.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { items?: unknown; profile?: unknown; session?: unknown; room?: unknown } | null;
  const items = (Array.isArray(body?.items) ? body!.items : [])
    .filter((x): x is ScenarioRequestItem => !!x && typeof x === "object" && typeof (x as ScenarioRequestItem).id === "string" && ["question", "listing", "offer"].includes((x as ScenarioRequestItem).kind))
    .slice(0, 12);
  if (!items.length) return NextResponse.json({ error: "items are required" }, { status: 400 });
  const room = typeof body?.room === "string" ? body.room.slice(0, 12) : undefined;
  const session = typeof body?.session === "string" ? body.session.slice(0, 64) : undefined;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow({ session, room, ip })) return NextResponse.json({ items: {}, source: "fallback", reason: "rate limited" });
  // Multiplayer rooms get generic scenarios: no profile at all.
  const profile = room ? {} : sanitizeScenarioProfile(body?.profile);
  const listing = items.every((i) => i.kind !== "question");
  const result = await writeScenarios(items, profile, { allowPlace: !room && !!profile.wants_nearby?.length, listing });
  return NextResponse.json({ items: result.items, source: result.source });
}
