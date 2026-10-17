// Validation for Gemini-written scenarios (PRD v4 Change 2). Pure, shared by the server route and the client.
// Gemini only varies framing: no digits, only known placeholders, short, the required features present,
// and nothing that reads as a legal claim. Anything else is rejected and a reviewed fallback is used.

export interface Feature {
  id: string;
  /** Any one of these (case-insensitive) must appear. "{rent}" style entries require the placeholder. */
  keywords: string[];
}

export interface ScenarioSpec {
  /** Placeholders this request may use, e.g. ["rent"] or ["place", "work"]. */
  placeholders: string[];
  features?: Feature[];
  /** Max sentences in the scenario (questions: 2, so with the prompt it fits 3 lines; listings: 3). */
  maxSentences: number;
}

export interface Scenario {
  scenario: string;
  host_line?: string;
}

export type Verdict = { ok: true; value: Scenario } | { ok: false; reason: string };

const MAX_WORDS = 15;
const MAX_CHARS = 400;

/** Phrases that would make Gemini sound like it's stating the law. Reviewed content carries the facts instead. */
const LEGAL = [
  /\billegal(ly)?\b/i,
  /\bunlawful\b/i,
  /\blaw says\b/i,
  /\bthe law\b/i,
  /\blegally\b/i,
  /\byou have the right\b/i,
  /\byour rights?\b/i,
  /\bentitled to\b/i,
  /\bsue\b/i,
  /\blawsuit\b/i,
  /\btribunal\b/i,
  /\bbylaw\b/i,
  /\bguideline\b/i,
  /\bresidential tenancies act\b/i,
];
const PROFANITY = /\b(fuck\w*|shit\w*|bitch\w*|cunt\w*|asshole\w*|bastard\w*|dick\w*|piss\w*|slut\w*|whore\w*|retard\w*|fag\w*)\b/i;

export const sentencesOf = (t: string) =>
  t
    .match(/[^.!?]+[.!?]*["”']?/g)
    ?.map((x) => x.trim())
    .filter(Boolean) ?? [];
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** Checks one Gemini output against a spec. */
export function validateScenario(raw: unknown, spec: ScenarioSpec): Verdict {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not an object" };
  const { scenario, host_line } = raw as Record<string, unknown>;
  if (typeof scenario !== "string" || !scenario.trim()) return { ok: false, reason: "missing scenario" };
  if (host_line !== undefined && typeof host_line !== "string") return { ok: false, reason: "bad host_line" };
  const texts = [scenario, ...(typeof host_line === "string" && host_line.trim() ? [host_line] : [])];
  for (const t of texts) {
    if (t.length > MAX_CHARS) return { ok: false, reason: "too long" };
    if (/\d/.test(t)) return { ok: false, reason: "contains a digit" };
    if (/[{}]/.test(t.replace(/\{([a-z]+)\}/g, ""))) return { ok: false, reason: "stray brace" };
    for (const m of t.matchAll(/\{([a-z]+)\}/g)) if (!spec.placeholders.includes(m[1])) return { ok: false, reason: `unknown placeholder {${m[1]}}` };
    if (LEGAL.some((r) => r.test(t))) return { ok: false, reason: "legal-claim wording" };
    if (PROFANITY.test(t)) return { ok: false, reason: "profanity" };
    if (/https?:|www\.|@/.test(t)) return { ok: false, reason: "link or contact detail" };
  }
  const s = sentencesOf(scenario);
  if (s.length > spec.maxSentences) return { ok: false, reason: "too many lines" };
  if (s.some((x) => words(x) > MAX_WORDS)) return { ok: false, reason: "line over 15 words" };
  if (typeof host_line === "string" && host_line.trim() && (sentencesOf(host_line).length > 1 || words(host_line) > MAX_WORDS)) return { ok: false, reason: "host line too long" };
  const lower = scenario.toLowerCase();
  for (const f of spec.features ?? []) if (!f.keywords.some((k) => lower.includes(k.toLowerCase()))) return { ok: false, reason: `missing feature ${f.id}` };
  return { ok: true, value: { scenario: scenario.trim(), ...(typeof host_line === "string" && host_line.trim() ? { host_line: host_line.trim() } : {}) } };
}

/** Fills {placeholders} from code-owned values. Unknown or missing ones never reach the screen. */
export function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{([a-z]+)\}/g, (_, k: string) => values[k] ?? "");
}

/** Short free-text input from a player (profile fields): trimmed, length-limited, profanity-filtered. */
export function cleanFreeText(t: string, max = 40): string {
  const s = t.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  return PROFANITY.test(s) ? "" : s;
}
