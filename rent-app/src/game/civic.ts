// Civic turn: the player sorts statements into personal / municipal / non-municipal, and gets
// jurisdiction feedback with an official source for every card.
import { lever } from "./data";
import type { CivicCard, CivicCategory, LeverSource } from "./types";

export const CATEGORY_LABEL: Record<CivicCategory, string> = {
  personal: "Something I verify myself",
  municipal: "A City of Toronto decision",
  "non-municipal": "Decided by another government",
};

export interface CardFeedback {
  card: CivicCard;
  chosen: CivicCategory;
  correct: boolean;
  text: string;
  sources: LeverSource[];
}

export interface CivicResult {
  feedback: CardFeedback[];
  correctCount: number;
  /** Did the player attribute the stage's municipal lever correctly? (reasoning tracker) */
  leverCorrect: boolean;
  personalAction: CivicCard | null;
  municipalCard: CivicCard;
}

function explain(card: CivicCard, chosen: CivicCategory): { text: string; sources: LeverSource[] } {
  const l = card.leverId ? lever(card.leverId) : null;
  const ok = chosen === card.correct;
  if (card.correct === "personal") {
    return {
      text: ok
        ? "Right. No public decision is needed: you can get this answer before you sign."
        : "This is something you can find out yourself before signing. No council or government decision controls it.",
      sources: [],
    };
  }
  if (card.correct === "municipal" && l) {
    const std = card.standard && l.standards ? ` ${l.standards[card.standard]}` : "";
    const lead = ok
      ? "Right: this is a City-level lever."
      : chosen === "personal"
        ? "You can check it yourself, but you can't change it yourself. It's set through a City agency, and the decision affects every renter on the route."
        : "This one is municipal. The TTC is a City of Toronto agency, not a provincial or federal one.";
    return { text: `${lead} ${l.summary}${std} ${l.standards?.review ?? ""}`.trim(), sources: l.sources };
  }
  if (l) {
    const lead = ok
      ? "Right: City Council doesn't control this."
      : chosen === "municipal"
        ? "City Council can't set this."
        : "You can ask the landlord about your unit, but the rules themselves aren't municipal.";
    return { text: `${lead} ${l.summary}`, sources: l.sources };
  }
  return { text: "", sources: [] };
}

export function judgeCivic(cards: CivicCard[], assignments: Record<string, CivicCategory>): CivicResult {
  const feedback = cards.map((card) => {
    const chosen = assignments[card.id];
    if (!chosen) throw new Error(`Card ${card.id} not sorted`);
    return { card, chosen, correct: chosen === card.correct, ...explain(card, chosen) };
  });
  const municipalCard = cards.find((c) => c.correct === "municipal");
  if (!municipalCard) throw new Error("Stage has no municipal card");
  return {
    feedback,
    correctCount: feedback.filter((f) => f.correct).length,
    leverCorrect: assignments[municipalCard.id] === "municipal",
    personalAction: cards.find((c) => assignments[c.id] === "personal") ?? null,
    municipalCard,
  };
}
