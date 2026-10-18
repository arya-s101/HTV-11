import { describe, expect, it } from "vitest";
import { estimateMonthly, livedStage, PRESETS, presetProfession, stageForProfession, templatePath, type Profession } from "./career";
import { isPlayable, STAGES } from "./data";
import { consequence, fareFor } from "./outcome";
import { reasoningScore } from "./score";
import { DEMO_CHARACTER, type Character } from "./sprite";
import type { PlayableStage } from "./types";

const playable = STAGES.filter(isPlayable) as PlayableStage[];
const firstJob = playable.find((s) => s.id === "first-job")!;
const as = (profession: Profession): Character => ({ ...DEMO_CHARACTER, profession });

describe("profession work details (income and trips)", () => {
  it("every preset sets valid work details for every playable stage", () => {
    for (const p of PRESETS) for (const s of playable) {
      const w = p.work?.[s.id];
      expect(w, `${p.id}/${s.id}`).toBeDefined();
      expect(Number.isInteger(w!.income.amountCents) && w!.income.amountCents > 0).toBe(true);
      expect(["annual", "monthly"]).toContain(w!.income.period);
      expect(["gross", "net"]).toContain(w!.income.basis);
      expect(w!.commuteDaysPerMonth).toBeGreaterThanOrEqual(1);
      expect(w!.commuteDaysPerMonth).toBeLessThanOrEqual(31);
      expect(w!.schedule.length).toBeGreaterThan(0);
    }
  });

  it("only overrides income and commute days; offers, civic cards and destination are untouched", () => {
    const s = stageForProfession(firstJob, presetProfession("nursing"));
    expect(s).not.toBe(firstJob);
    expect(s.offers).toEqual(firstJob.offers);
    expect(s.civicCards).toEqual(firstJob.civicCards);
    expect(s.destination).toEqual(firstJob.destination);
    expect(s.income).not.toEqual(firstJob.income);
  });

  it("software (the demo preset) keeps the PRD §4.7 hero values", () => {
    const c = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-a", revealed: false });
    expect(c.monthlyIncomeCents).toBe(458_333);
    expect(c.fareCents).toBe(13_200);
    expect(c.rentBurdenPct).toBe(34.9);
  });

  it("a different preset changes income, burden, fare and commute hours", () => {
    const base = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-a", revealed: false });
    const nurse = consequence({ character: as(presetProfession("nursing")), stage: firstJob, offerId: "s2-a", revealed: false });
    expect(nurse.monthlyIncomeCents).not.toBe(base.monthlyIncomeCents);
    expect(nurse.rentBurdenPct).not.toBe(base.rentBurdenPct);
    expect(nurse.fareCents).not.toBe(base.fareCents);
    expect(nurse.commuteHours).not.toBe(base.commuteHours);
    expect(nurse.offer).toEqual(base.offer);
  });

  it("fare for a profession uses its trips", () => {
    const nursing = stageForProfession(firstJob, presetProfession("nursing"));
    expect(fareFor(nursing).cents).toBe(nursing.commuteDaysPerMonth * 2 * 330);
  });

  it("custom (template or LLM) professions never set numbers: stage defaults apply", () => {
    const custom: Profession = { id: "custom", label: "pharmacist", path: templatePath("pharmacist"), source: "template" };
    expect(stageForProfession(firstJob, custom)).toEqual(firstJob);
  });

  it("a player-set monthly income replaces the job estimate and changes burden only", () => {
    expect(estimateMonthly(presetProfession("software"), 23).cents).toBe(458_333);
    expect(estimateMonthly(presetProfession("software"), 19).cents).toBe(160_000);
    const custom = consequence({ character: { ...DEMO_CHARACTER, monthlyIncomeCents: 200_000 }, stage: firstJob, offerId: "s2-a", revealed: false });
    expect(custom.monthlyIncomeCents).toBe(200_000);
    expect(custom.rentBurdenPct).toBe(80);
    expect(livedStage(firstJob, { profession: presetProfession("software"), monthlyIncomeCents: 200_000 }).offers).toEqual(firstJob.offers);
  });

  it("the reasoning score has no income or trip input", () => {
    const input = { difficulty: "easy" as const, unknownsFlagged: 1, unknownsTotal: 2, leverCorrect: true, otherCardsCorrect: 2, otherCardsTotal: 2, commuteDecoded: null, tableRead: null };
    expect(Object.keys(input)).not.toContain("income");
    expect(reasoningScore(input).total).toBe(80);
  });
});
