// Landlord negotiation engine. CODE DECIDES THE DEAL: this module turns the player's messages into a
// deterministic landlord decision (rent, concessions, status). An LLM may only phrase that decision; its
// output is validated here and replaced by the scripted line if it strays (numbers, legal talk, concessions).
import { money } from "./outcome";
import type { Difficulty } from "./types";

export interface Concession {
  id: string;
  label: string;
  monetary: boolean;
}

export interface NegotiationConfig {
  landlord: string;
  persona: string;
  concessions: Concession[];
}

/** Facts about the offer that code (not the model) knows. */
export interface OfferFacts {
  offerId: string;
  askingCents: number;
  /** CMHC Oct 2025 vacant-unit zone average for this unit type, or null if unpublished/not comparable. */
  benchmarkCents: number | null;
  benchmarkLabel: string;
}

export const RULES: Record<Difficulty, { floorPct: number; genericStep: number; evidenceStep: number; moverStep: number; maxTurns: number; maxConcessions: number }> = {
  easy: { floorPct: 0.08, genericStep: 5000, evidenceStep: 10000, moverStep: 5000, maxTurns: 6, maxConcessions: 2 },
  normal: { floorPct: 0.05, genericStep: 2500, evidenceStep: 7500, moverStep: 2500, maxTurns: 5, maxConcessions: 1 },
  // Hard landlords won't move on price for generic haggling or sweeteners; they trade a concession instead.
  hard: { floorPct: 0.02, genericStep: 0, evidenceStep: 5000, moverStep: 0, maxTurns: 4, maxConcessions: 1 },
};

export const MAX_MESSAGE_CHARS = 400;

export function floorCents(askingCents: number, d: Difficulty): number {
  // Round UP to the nearest $25 so the floor never sits below the stated percentage.
  return Math.ceil((askingCents * (1 - RULES[d].floorPct)) / 2500) * 2500;
}

export type Code =
  | "abuse"
  | "legal-deflect"
  | "evidence-accepted"
  | "evidence-rebutted"
  | "evidence-none"
  | "census-rebutted"
  | "flex-accepted"
  | "flex-traded"
  | "lease-accepted"
  | "lease-traded"
  | "concession-granted"
  | "concession-refused"
  | "generic-moved"
  | "generic-firm"
  | "repeat"
  | "unclear"
  | "at-floor"
  | "final-offer"
  | "closed";

export interface NegState {
  rentCents: number;
  concessions: string[];
  turns: number;
  used: { evidence: boolean; flex: boolean; lease: boolean; generic: number };
  status: "open" | "final" | "ended";
}

export interface Reply {
  codes: { code: Code; concessionId?: string }[];
  rentCents: number;
  concessions: Concession[];
  status: NegState["status"];
  legal: boolean;
  turnsLeft: number;
}

const RX = {
  abusive: /\b(idiot|stupid|dumb|moron|loser|bitch|shit\w*|f+u+c+k\w*|scam(mer)?|shut up)\b/i,
  legal: /\b(deposit|last month'?s|rent increases?|raise the rent|evict\w*|landlord and tenant board|ltb|legal(ly)?|my rights|tenant rights|rent[- ]control\w*|key money|n12|n4|lawyer|sue)\b/i,
  evidence: /\b(cmhc|benchmark|average rent|market average|survey|zone average|going rate|market rate|data)\b/i,
  census: /\b(census|2021|median shelter)\b/i,
  flex: /\b(flexib\w*|any (move[- ]in )?date|whenever works|move in (whenever|any ?time))\b/i,
  lease: /\b(longer lease|18[- ]?months?|two[- ]years?|2[- ]years?|24[- ]?months?|long[- ]term|longer term)\b/i,
  generic: /(lower|less|reduce|discount|come down|negotiat\w*|cheaper|budget|can you do|best price|\$\s?\d)/i,
};

const CONCESSION_RX: Record<string, RegExp> = {
  "utilities-included": /\b(utilit\w*|hydro)\b.*\b(includ\w*|cover\w*|free)\b|\b(includ\w*|cover\w*)\b.*\b(utilit\w*|hydro)\b/i,
  "move-in-flex": /\b(my own|pick|choose|later|earlier)\b.*\bmove[- ]in\b/i,
  parking: /\bparking\b/i,
  "fresh-paint": /\bpaint\w*\b/i,
  "laundry-waived": /\blaundry\b/i,
  storage: /\b(storage|locker)\b/i,
  "furnished-desk": /\b(desk|chair|furnish\w*)\b/i,
};

export function initialState(facts: OfferFacts): NegState {
  return { rentCents: facts.askingCents, concessions: [], turns: 0, used: { evidence: false, flex: false, lease: false, generic: 0 }, status: "open" };
}

function reply(state: NegState, codes: Reply["codes"], cfg: NegotiationConfig, d: Difficulty, legal: boolean): Reply {
  return {
    codes,
    rentCents: state.rentCents,
    concessions: cfg.concessions.filter((c) => state.concessions.includes(c.id)),
    status: state.status,
    legal,
    turnsLeft: Math.max(0, RULES[d].maxTurns - state.turns),
  };
}

/** One player message → the landlord's deterministic decision. Pure: returns a new state. */
export function step(prev: NegState, message: string, facts: OfferFacts, cfg: NegotiationConfig, d: Difficulty): { state: NegState; reply: Reply } {
  const r = RULES[d];
  const s: NegState = { ...prev, concessions: [...prev.concessions], used: { ...prev.used } };
  const text = message.slice(0, MAX_MESSAGE_CHARS);
  if (s.status !== "open") return { state: s, reply: reply(s, [{ code: "closed" }], cfg, d, false) };
  s.turns += 1;

  if (RX.abusive.test(text)) {
    s.status = "ended";
    return { state: s, reply: reply(s, [{ code: "abuse" }], cfg, d, false) };
  }

  const codes: Reply["codes"] = [];
  const legal = RX.legal.test(text);
  if (legal) codes.push({ code: "legal-deflect" });

  let drop = 0;
  const nextNonMonetary = () =>
    s.concessions.length < r.maxConcessions ? cfg.concessions.find((x) => !x.monetary && !s.concessions.includes(x.id)) : undefined;

  if (RX.evidence.test(text)) {
    if (s.used.evidence) codes.push({ code: "repeat" });
    else {
      s.used.evidence = true;
      if (facts.benchmarkCents === null) codes.push({ code: "evidence-none" });
      else if (facts.askingCents > facts.benchmarkCents) {
        drop += r.evidenceStep;
        codes.push({ code: "evidence-accepted" });
      } else codes.push({ code: "evidence-rebutted" });
    }
  }
  if (RX.census.test(text)) codes.push({ code: "census-rebutted" });

  for (const [key, code, traded] of [
    ["flex", "flex-accepted", "flex-traded"],
    ["lease", "lease-accepted", "lease-traded"],
  ] as const) {
    if (!RX[key].test(text) || s.used[key]) continue;
    s.used[key] = true;
    if (r.moverStep > 0) {
      drop += r.moverStep;
      codes.push({ code });
    } else {
      const c = nextNonMonetary();
      if (c) {
        s.concessions.push(c.id);
        codes.push({ code: traded }, { code: "concession-granted", concessionId: c.id });
      } else codes.push({ code: "generic-firm" });
    }
  }

  for (const c of cfg.concessions) {
    if (!CONCESSION_RX[c.id]?.test(text) || s.concessions.includes(c.id)) continue;
    if (s.concessions.length < r.maxConcessions) {
      s.concessions.push(c.id);
      codes.push({ code: "concession-granted", concessionId: c.id });
    } else codes.push({ code: "concession-refused", concessionId: c.id });
  }

  // A message already answered on price (moved, or an evidence argument weighed) doesn't also count as haggling.
  const priceAnswered = drop > 0 || codes.some((c) => c.code.startsWith("evidence") || c.code === "census-rebutted");
  if (!priceAnswered && RX.generic.test(text)) {
    if (r.genericStep > 0 && s.used.generic < 2) {
      s.used.generic += 1;
      drop += r.genericStep;
      codes.push({ code: "generic-moved" });
    } else codes.push({ code: "generic-firm" });
  }

  const floor = floorCents(facts.askingCents, d);
  if (drop > 0) {
    const next = Math.max(floor, s.rentCents - drop);
    if (next === floor) codes.push({ code: "at-floor" });
    s.rentCents = next;
  }
  if (codes.length === 0) codes.push({ code: "unclear" });
  if (s.turns >= r.maxTurns && s.status === "open") {
    s.status = "final";
    codes.push({ code: "final-offer" });
  }
  return { state: s, reply: reply(s, codes, cfg, d, legal) };
}

/** Server-side replay: the client's transcript is never trusted for state, only its player messages. */
export function replay(playerMessages: string[], facts: OfferFacts, cfg: NegotiationConfig, d: Difficulty) {
  let state = initialState(facts);
  let last: Reply | null = null;
  for (const m of playerMessages) ({ state, reply: last } = step(state, m, facts, cfg, d));
  return { state, reply: last };
}

export function openingLine(facts: OfferFacts, cfg: NegotiationConfig): string {
  return `Hi, this is ${cfg.landlord}. The place is ${money(facts.askingCents)} a month. Happy to answer questions or hear an offer.`;
}

/** Deterministic landlord line for a decision: the fallback, and the demo-preset voice. */
export function scriptedMessage(rep: Reply, facts: OfferFacts, cfg: NegotiationConfig, d: Difficulty): string {
  const label = (id?: string) => cfg.concessions.find((c) => c.id === id)?.label.toLowerCase() ?? "that";
  const lines: string[] = [];
  for (const { code, concessionId } of rep.codes) {
    switch (code) {
      case "abuse":
        return "I'm going to end the conversation here. Take care.";
      case "closed":
        return "We've already settled where things stand.";
      case "legal-deflect":
        lines.push("I can't advise on tenancy rules or rights. The Province publishes those; please check the official Ontario page.");
        break;
      case "evidence-accepted":
        lines.push(`Fair point: the ${facts.benchmarkLabel} is ${money(facts.benchmarkCents!)}, and I'm above that. I can come down.`);
        break;
      case "evidence-rebutted":
        lines.push(`I checked that too: the ${facts.benchmarkLabel} is ${money(facts.benchmarkCents!)}, and I'm already under it.`);
        break;
      case "evidence-none":
        lines.push("There's no published average for this kind of unit here, so that doesn't change my number.");
        break;
      case "census-rebutted":
        lines.push("Those census figures are from 2021 and include people who've rented for years, so they're not today's asking rents.");
        break;
      case "flex-accepted":
        lines.push("A flexible move-in date helps me avoid a gap. I can take a bit off for that.");
        break;
      case "lease-accepted":
        lines.push("A longer commitment is worth something to me. I'll trim the rent a little.");
        break;
      case "flex-traded":
      case "lease-traded":
        lines.push("I can't move on price for that, but I'll add something instead.");
        break;
      case "concession-granted":
        lines.push(`Done: ${label(concessionId)}.`);
        break;
      case "concession-refused":
        lines.push(`I can't add ${label(concessionId)} on top of what we've agreed.`);
        break;
      case "generic-moved":
        lines.push("I can come down a little.");
        break;
      case "generic-firm":
        lines.push(d === "hard" ? "I have other applicants interested, so the price is firm." : "I'm not able to move on price for that.");
        break;
      case "repeat":
        lines.push("We've covered that already.");
        break;
      case "unclear":
        lines.push("Sorry, what are you proposing?");
        break;
      case "at-floor":
        lines.push("That's as low as I can go.");
        break;
      case "final-offer":
        lines.push("This is my final offer.");
        break;
    }
  }
  const extras = rep.concessions.length ? `, with ${rep.concessions.map((c) => c.label.toLowerCase()).join(" and ")}` : "";
  lines.push(`So that's ${money(rep.rentCents)} a month${extras}.`);
  return lines.join(" ");
}

// ---------------- LLM output validation ----------------

export interface LlmOutput {
  message: string;
  proposed_rent: number; // dollars
  proposed_concessions: string[];
  deal_status: "open" | "final" | "ended";
}

const LEGAL_TALK = /\b(law|legal|tribunal|landlord and tenant board|ltb|evict\w*|deposit|rent control|guideline|act)\b/i;

/**
 * Accepts the model's wording only if it agrees with code's decision. Any rent or concession the model
 * proposes is ignored in favour of code's; a message quoting a different dollar figure or touching on legal
 * rules is replaced by the scripted line.
 */
export function validateLlm(raw: unknown, rep: Reply, facts: OfferFacts, fallback: string): { message: string; source: "llm" | "scripted"; adjustments: string[] } {
  const adjustments: string[] = [];
  const o = raw as Partial<LlmOutput> | null;
  if (!o || typeof o.message !== "string" || !o.message.trim() || o.message.length > 600) {
    return { message: fallback, source: "scripted", adjustments: ["unusable model output"] };
  }
  if (typeof o.proposed_rent !== "number" || Math.round(o.proposed_rent * 100) !== rep.rentCents) adjustments.push("model rent ignored; code's rent used");
  const allowed = new Set(rep.concessions.map((c) => c.id));
  if (Array.isArray(o.proposed_concessions) && o.proposed_concessions.some((c) => !allowed.has(c))) adjustments.push("concession outside code's decision rejected");
  if (o.deal_status !== rep.status) adjustments.push("deal status set by code");

  const okAmounts = new Set([rep.rentCents, facts.askingCents, facts.benchmarkCents].filter((x): x is number => x !== null));
  const quoted = [...o.message.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g)].map((m) => Math.round(Number(m[1].replace(/,/g, "")) * 100));
  if (quoted.some((c) => !okAmounts.has(c))) return { message: fallback, source: "scripted", adjustments: [...adjustments, "message quoted a figure code didn't decide"] };
  if (!rep.legal && LEGAL_TALK.test(o.message)) return { message: fallback, source: "scripted", adjustments: [...adjustments, "message touched on legal rules"] };
  if (rep.legal && LEGAL_TALK.test(o.message.replace(/official ontario page/i, ""))) {
    return { message: fallback, source: "scripted", adjustments: [...adjustments, "legal question deflected by script"] };
  }
  return { message: o.message.trim(), source: "llm", adjustments };
}
