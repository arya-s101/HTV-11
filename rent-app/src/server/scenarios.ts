// SERVER-ONLY scenario writer (PRD v4 Change 2). Gemini varies framing only; every item is validated in code,
// failures are retried once, and anything still invalid is left out so the client uses a reviewed fallback.
import "server-only";
import { briefFor, specFor, type ScenarioRequestItem } from "@/game/questions";
import { validateScenario, type Scenario } from "@/game/scenario";
import type { ScenarioProfile } from "@/game/profile";
import { geminiJson, hasGeminiKey } from "./gemini";

const TIMEOUT_MS = 6000;
const MAX_ITEMS = 12;

const SYSTEM = `You write short, friendly scene-setting text for a Toronto renting game show.
Rules you must follow:
- Write ONLY the situation. Never give advice, answers, options, rules, rights, laws, costs or statistics.
- Never write any digit. If a price is needed, write the placeholder exactly as given (for example {rent}).
- Use only placeholders that the request lists. Don't invent new ones.
- Each sentence is at most 15 words. Plain, warm, PG language. Full sentences in one paragraph: no bullet points, lists or line breaks. No real people, brands, phone numbers or links.
- Use the player's stated preferences only as light flavour; never assume anything else about them.
- host_line is one short, upbeat line from the host, at most 15 words, with no facts.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: { type: "object", properties: { id: { type: "string" }, scenario: { type: "string" }, host_line: { type: "string" } }, required: ["id", "scenario"] },
    },
  },
  required: ["items"],
};

function prompt(items: ScenarioRequestItem[], profile: ScenarioProfile, allowPlace: boolean): string {
  const lines = items.map((it) => {
    const spec = specFor(it, allowPlace);
    const max = spec.maxSentences;
    const feats = spec.features?.length ? ` It must clearly include: ${spec.features.map((f) => f.id).join(", ")}.` : "";
    const ph = spec.placeholders.length ? ` Allowed placeholders: ${spec.placeholders.map((p) => `{${p}}`).join(", ")}.` : " No placeholders.";
    return `- id "${it.id}": ${briefFor(it)} At most ${max} sentences.${feats}${ph}`;
  });
  return [
    `Player preferences (flavour only, may be empty): ${JSON.stringify(profile)}`,
    allowPlace ? "If it fits naturally, a question scene may mention {place} (a place the player wants nearby) or {work}." : "Don't mention specific places the player wants nearby.",
    "Write one item per id:",
    ...lines,
  ].join("\n");
}

export interface ScenarioResult {
  items: Record<string, Scenario>;
  source: "llm" | "fallback";
  rejected: Record<string, string>;
}

/** Asks Gemini for the given items; returns only items that pass validation (after one retry). */
export async function writeScenarios(items: ScenarioRequestItem[], profile: ScenarioProfile, opts: { allowPlace: boolean; listing: boolean }): Promise<ScenarioResult> {
  const wanted = items.filter((it) => briefFor(it)).slice(0, MAX_ITEMS);
  const out: Record<string, Scenario> = {};
  const rejected: Record<string, string> = {};
  if (!hasGeminiKey() || wanted.length === 0) return { items: out, source: "fallback", rejected };
  let todo = wanted;
  for (let attempt = 0; attempt < 2 && todo.length; attempt++) {
    try {
      const raw = (await geminiJson({
        system: SYSTEM,
        contents: [{ role: "user", text: prompt(todo, profile, opts.allowPlace) }],
        schema: SCHEMA,
        temperature: opts.listing ? 0.3 : 0.9,
        timeoutMs: TIMEOUT_MS,
      })) as { items?: unknown };
      const got = Array.isArray(raw?.items) ? (raw.items as Record<string, unknown>[]) : [];
      for (const it of todo) {
        const g = got.find((x) => x?.id === it.id);
        const v = validateScenario(g, specFor(it, opts.allowPlace));
        if (v.ok) out[it.id] = v.value;
        else rejected[it.id] = v.reason;
      }
    } catch (e) {
      for (const it of todo) rejected[it.id] = e instanceof Error && e.name === "AbortError" ? "timed out" : "model call failed";
    }
    todo = todo.filter((it) => !out[it.id]);
  }
  for (const id of Object.keys(out)) delete rejected[id];
  return { items: out, source: Object.keys(out).length ? "llm" : "fallback", rejected };
}

// ---------- rate limits (in memory; per session, per room and per IP) ----------
const WINDOW_MS = 10 * 60 * 1000;
const LIMITS = { session: 20, room: 40, ip: 60 };
const hits = new Map<string, { n: number; since: number }>();
export function allow(keys: { session?: string; room?: string; ip?: string }): boolean {
  const now = Date.now();
  const checks = (["session", "room", "ip"] as const).filter((k) => keys[k]).map((k) => [`${k}:${keys[k]}`, LIMITS[k]] as const);
  for (const [key, max] of checks) {
    const h = hits.get(key);
    if (h && now - h.since < WINDOW_MS && h.n >= max) return false;
  }
  for (const [key] of checks) {
    const h = hits.get(key);
    hits.set(key, h && now - h.since < WINDOW_MS ? { n: h.n + 1, since: h.since } : { n: 1, since: now });
  }
  return true;
}
