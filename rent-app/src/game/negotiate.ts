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
  /** Rent of the cheapest other offer in this stage, if one is cheaper; makes "I've seen a cheaper place" a valid point. */
  cheaperAlternativeCents?: number | null;
}

interface Rule {
  floorPct: number;
  /** A strong enough case unlocks extra leeway: a deeper floor and a one-time goodwill cut. */
  strongFloorPct: number;
  strongAt: number;
  strongStep: number;
  genericStep: number;
  evidenceStep: number;
  moverStep: number;
  maxTurns: number;
  maxConcessions: number;
}

export const RULES: Record<Difficulty, Rule> = {
  easy: { floorPct: 0.08, strongFloorPct: 0.12, strongAt: 3, strongStep: 7500, genericStep: 5000, evidenceStep: 10000, moverStep: 5000, maxTurns: 6, maxConcessions: 2 },
  normal: { floorPct: 0.05, strongFloorPct: 0.08, strongAt: 4, strongStep: 7500, genericStep: 2500, evidenceStep: 7500, moverStep: 2500, maxTurns: 5, maxConcessions: 1 },
  // Hard landlords won't move on price for generic haggling or sweeteners, but a really strong case still earns leeway.
  hard: { floorPct: 0.02, strongFloorPct: 0.05, strongAt: 5, strongStep: 5000, genericStep: 0, evidenceStep: 5000, moverStep: 0, maxTurns: 4, maxConcessions: 1 },
};

/** How much each kind of argument adds to the player's case. Each kind counts once per conversation. */
export const STRENGTH = { evidence: 2, compare: 2, quality: 1, ready: 1, flex: 1, lease: 1 } as const;

export const MAX_MESSAGE_CHARS = 400;

export function floorCents(askingCents: number, d: Difficulty, strong = false): number {
  // Round UP to the nearest $25 so the floor never sits below the stated percentage.
  const pct = strong ? RULES[d].strongFloorPct : RULES[d].floorPct;
  return Math.ceil((askingCents * (1 - pct)) / 2500) * 2500;
}

export type Code =
  | "abuse"
  | "legal-deflect"
  | "evidence-accepted"
  | "evidence-rebutted"
  | "evidence-none"
  | "census-rebutted"
  | "compare-accepted"
  | "compare-rebutted"
  | "quality-noted"
  | "ready-noted"
  | "strong-case"
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
  used: { evidence: boolean; flex: boolean; lease: boolean; quality: boolean; ready: boolean; compare: boolean; generic: number };
  strength: number;
  strong: boolean;
  status: "open" | "final" | "ended";
}

export interface Reply {
  codes: { code: Code; concessionId?: string }[];
  rentCents: number;
  concessions: Concession[];
  status: NegState["status"];
  legal: boolean;
  turnsLeft: number;
  strength: number;
  strongAt: number;
  strong: boolean;
}

const RX = {
  abusive: /\b(idiot|stupid|dumb|moron|loser|bitch|shit\w*|f+u+c+k\w*|scam(mer)?|shut up)\b/i,
  legal: /\b(deposit|last month'?s|rent increases?|raise the rent|evict\w*|landlord and tenant board|ltb|legal(ly)?|my rights|tenant rights|rent[- ]control\w*|key money|n12|n4|lawyer|sue)\b/i,
  evidence: /\b(cmhc|benchmark|average rent|market average|survey|zone average|going rate|market rate|data)\b/i,
  census: /\b(census|2021|median shelter)\b/i,
  flex: /\b(flexib\w*|any (move[- ]in )?date|whenever works|move in (whenever|any ?time))\b/i,
  lease: /\b(longer lease|18[- ]?months?|two[- ]years?|2[- ]years?|24[- ]?months?|long[- ]term|longer term)\b/i,
  quality: /\b(references?|stable (job|income)|steady (job|income)|full[- ]time|good credit|credit score|never (been )?late|pay(s)? (the rent )?on time|non[- ]smoker|no pets|employed|reliable|responsible tenant)\b/i,
  ready: /\b(sign (today|now|right away|this week|immediately)|ready to sign|can sign (today|now|this week)|move in (right away|asap|immediately|this week|next week)|ready to go)\b/i,
  compare: /\b(another (place|unit|listing|apartment)|other (place|unit|listing|apartment|offer)s?|elsewhere|cheaper (place|option|unit|listing)|comparable|similar (place|unit)s?)\b/i,
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
  return {
    rentCents: facts.askingCents,
    concessions: [],
    turns: 0,
    used: { evidence: false, flex: false, lease: false, quality: false, ready: false, compare: false, generic: 0 },
    strength: 0,
    strong: false,
    status: "open",
  };
}

function reply(state: NegState, codes: Reply["codes"], cfg: NegotiationConfig, d: Difficulty, legal: boolean): Reply {
  return {
    codes,
    rentCents: state.rentCents,
    concessions: cfg.concessions.filter((c) => state.concessions.includes(c.id)),
    status: state.status,
    legal,
    turnsLeft: Math.max(0, RULES[d].maxTurns - state.turns),
    strength: state.strength,
    strongAt: RULES[d].strongAt,
    strong: state.strong,
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
        s.strength += STRENGTH.evidence;
        codes.push({ code: "evidence-accepted" });
      } else codes.push({ code: "evidence-rebutted" });
    }
  }
  if (RX.census.test(text)) codes.push({ code: "census-rebutted" });

  if (RX.compare.test(text) && !s.used.compare) {
    s.used.compare = true;
    if (facts.cheaperAlternativeCents != null && facts.cheaperAlternativeCents < facts.askingCents) {
      s.strength += STRENGTH.compare;
      drop += r.genericStep;
      codes.push({ code: "compare-accepted" });
    } else codes.push({ code: "compare-rebutted" });
  }
  for (const key of ["quality", "ready"] as const) {
    if (!RX[key].test(text) || s.used[key]) continue;
    s.used[key] = true;
    s.strength += STRENGTH[key];
    codes.push({ code: key === "quality" ? "quality-noted" : "ready-noted" });
  }

  for (const [key, code, traded] of [
    ["flex", "flex-accepted", "flex-traded"],
    ["lease", "lease-accepted", "lease-traded"],
  ] as const) {
    if (!RX[key].test(text) || s.used[key]) continue;
    s.used[key] = true;
    s.strength += STRENGTH[key];
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
  const priceAnswered = drop > 0 || codes.some((c) => c.code.startsWith("evidence") || c.code.startsWith("compare") || c.code === "census-rebutted");
  if (!priceAnswered && RX.generic.test(text)) {
    if (r.genericStep > 0 && s.used.generic < 2) {
      s.used.generic += 1;
      drop += r.genericStep;
      codes.push({ code: "generic-moved" });
    } else codes.push({ code: "generic-firm" });
  }

  // A strong enough case earns a one-time goodwill cut and a deeper floor (the extra leeway).
  if (!s.strong && s.strength >= r.strongAt) {
    s.strong = true;
    drop += r.strongStep;
    codes.push({ code: "strong-case" });
  }
  const floor = floorCents(facts.askingCents, d, s.strong);
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
  return `Hey! This is ${cfg.landlord}. Thanks for reaching out about the place. It's ${money(facts.askingCents)} a month, and I'm happy to chat about anything.`;
}

/** Deterministic landlord line for a decision: the fallback, and the demo-preset voice. Friendly, never legal advice. */
export function scriptedMessage(rep: Reply, facts: OfferFacts, cfg: NegotiationConfig, d: Difficulty): string {
  const label = (id?: string) => cfg.concessions.find((c) => c.id === id)?.label.toLowerCase() ?? "that";
  const lines: string[] = [];
  for (const { code, concessionId } of rep.codes) {
    switch (code) {
      case "abuse":
        return "Okay, I think it's best we leave it here. Take care, and good luck with the search.";
      case "closed":
        return "I think we've landed where we're going to land, but thanks for chatting with me!";
      case "legal-deflect":
        lines.push("Honestly, I'm not the right person for the legal side of renting, and I'd hate to steer you wrong. The Province has a really clear page on tenant rights, linked just below.");
        break;
      case "evidence-accepted":
        lines.push(`Oh, fair point. The ${facts.benchmarkLabel} is ${money(facts.benchmarkCents!)}, and I'm above that, so I can come down for you.`);
        break;
      case "evidence-rebutted":
        lines.push(`I hear you! I actually looked that up too: the ${facts.benchmarkLabel} is ${money(facts.benchmarkCents!)}, so I'm already a bit under it.`);
        break;
      case "evidence-none":
        lines.push("Good thinking, but there isn't a published average for this kind of place, so I don't have much to go on there.");
        break;
      case "census-rebutted":
        lines.push("Those census numbers are from 2021 and include folks who've been renting for years, so they're a bit different from what places go for now.");
        break;
      case "compare-accepted":
        lines.push("That's fair, I know there are cheaper places out there and I'd rather it be you than an empty unit.");
        break;
      case "compare-rebutted":
        lines.push("Honestly, I think this is already one of the more affordable options around.");
        break;
      case "quality-noted":
        lines.push("That's really good to hear. A reliable tenant means a lot to me.");
        break;
      case "ready-noted":
        lines.push("Love that you're ready to go.");
        break;
      case "strong-case":
        lines.push("Okay, you've made a really good case. Let me do a bit better for you.");
        break;
      case "flex-accepted":
        lines.push("Being flexible on the move-in date really helps me out, so I can take a little off.");
        break;
      case "lease-accepted":
        lines.push("A longer lease means a lot to me. I'll trim the rent a bit for that.");
        break;
      case "flex-traded":
      case "lease-traded":
        lines.push("I can't really budge on the price for that, but I'd love to throw something in instead.");
        break;
      case "concession-granted":
        lines.push(`Sure, happy to do ${label(concessionId)}!`);
        break;
      case "concession-refused":
        lines.push(`I wish I could add ${label(concessionId)} too, but that's about all I can stretch to.`);
        break;
      case "generic-moved":
        lines.push("Let me see what I can do. I can come down a little.");
        break;
      case "generic-firm":
        lines.push(d === "hard" ? "I'm sorry, I've had a few people interested, so I need to keep the price where it is." : "I'm sorry, I can't really move on the price for that.");
        break;
      case "repeat":
        lines.push("I think we already covered that one!");
        break;
      case "unclear":
        lines.push("Sorry, I'm not totally sure what you're asking. What did you have in mind?");
        break;
      case "at-floor":
        lines.push("That's honestly as low as I can go.");
        break;
      case "final-offer":
        lines.push("This is my last offer, but I really hope it works for you.");
        break;
    }
  }
  const extras = rep.concessions.length ? `, with ${rep.concessions.map((c) => c.label.toLowerCase()).join(" and ")}` : "";
  lines.push(`So we're at ${money(rep.rentCents)} a month${extras}.`);
  return lines.join(" ");
}

// ---------------- LLM output validation ----------------

export interface LlmOutput {
  message: string;
  proposed_rent: number; // dollars
  proposed_concessions: string[];
  deal_status: "open" | "final" | "ended";
}

const NUM_WORD = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety";
// "hundred"/"thousand", or a pair like "eighteen sixty" / "twenty-five": how prices get written out in words.
const SPELLED_AMOUNT = new RegExp(`\\b(hundred|thousand|grand|k a month)\\b|\\b(eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\\s-]+(${NUM_WORD}|hundred|thousand)\\b`, "i");
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

  // Amounts spelled out in words ("sixteen hundred") can't be checked, so they're refused outright.
  if (SPELLED_AMOUNT.test(o.message)) return { message: fallback, source: "scripted", adjustments: [...adjustments, "message spelled out an amount"] };
  const okAmounts = new Set([rep.rentCents, facts.askingCents, facts.benchmarkCents].filter((x): x is number => x !== null));
  // Every $ figure, and every bare number of 100+ that isn't a year, must be one code decided.
  const unapproved = [...o.message.matchAll(/(\$)?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g)].some((m) => {
    const value = Number(m[2].replace(/,/g, "")) + (m[3] ? Number(`0.${m[3]}`) : 0);
    if (!m[1] && (value < 100 || (value >= 1900 && value <= 2099 && !m[3]))) return false;
    return !okAmounts.has(Math.round(value * 100));
  });
  if (unapproved) return { message: fallback, source: "scripted", adjustments: [...adjustments, "message quoted a figure code didn't decide"] };
  if (!rep.legal && LEGAL_TALK.test(o.message)) return { message: fallback, source: "scripted", adjustments: [...adjustments, "message touched on legal rules"] };
  if (rep.legal && LEGAL_TALK.test(o.message.replace(/official ontario page/i, ""))) {
    return { message: fallback, source: "scripted", adjustments: [...adjustments, "legal question deflected by script"] };
  }
  return { message: o.message.trim(), source: "llm", adjustments };
}
