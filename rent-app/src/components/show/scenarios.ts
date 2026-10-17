"use client";

// Background scenario fetches (PRD v4 Change 2): one request per round, started during character creation so
// questions are ready before round 1. Results are validated again here before use; anything missing or invalid
// simply keeps its reviewed fallback, so the player never waits on or sees a failure.
import { LISTING_PROSE, specFor, type RunPlan, type ScenarioMap, type ScenarioRequestItem } from "@/game/questions";
import { validateScenario } from "@/game/scenario";
import type { ScenarioProfile } from "@/game/profile";

const CLIENT_TIMEOUT_MS = 7000;

function sessionId(): string {
  try {
    let id = sessionStorage.getItem("trd.session");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("trd.session", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

/** The request batches for a run: one per round. */
export function batchesFor(plan: RunPlan, listingIds: string[], offerIds: string[], rounds: string[]): ScenarioRequestItem[][] {
  const q = (ids: string[]) => ids.map((id) => ({ id, kind: "question" as const }));
  const batches: ScenarioRequestItem[][] = [];
  if (rounds.includes("search")) batches.push([...listingIds.map((id) => ({ id, kind: LISTING_PROSE[id] ? ("listing" as const) : ("offer" as const) })), ...(rounds.includes("scamReport") ? q([plan.scamReport]) : [])]);
  if (rounds.includes("viewing")) batches.push([...offerIds.map((id) => ({ id, kind: "offer" as const })), ...q(plan.viewing)]);
  if (rounds.includes("movein")) batches.push(q([plan.movein]));
  if (rounds.includes("live")) batches.push(q(plan.events));
  if (rounds.includes("moveout")) batches.push(q([plan.moveout]));
  return batches.filter((b) => b.length);
}

/** Fetches all batches in parallel; calls onItems as each round's results arrive. Never throws. */
export async function prefetchScenarios(batches: ScenarioRequestItem[][], profile: ScenarioProfile, onItems: (m: ScenarioMap) => void, room?: string): Promise<void> {
  const session = sessionId();
  const allowPlace = !room && !!profile.wants_nearby?.length;
  await Promise.all(
    batches.map(async (items) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
      try {
        const res = await fetch("/api/scenarios", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items, profile: room ? {} : profile, session, ...(room ? { room } : {}) }),
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { items?: Record<string, unknown> };
        const ok: ScenarioMap = {};
        for (const it of items) {
          const v = validateScenario(data.items?.[it.id], specFor(it, allowPlace));
          if (v.ok) ok[it.id] = v.value;
        }
        if (Object.keys(ok).length) onItems(ok);
      } catch {
        // offline, blocked or slow: reviewed fallbacks stay in place
      } finally {
        clearTimeout(t);
      }
    }),
  );
}
