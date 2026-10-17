import { afterEach, describe, expect, it, vi } from "vitest";
import { MODES } from "../config/modes";
import { STAGES } from "./data";
import { DEMO_SEED, leaseFor, listingsFor, reportCard } from "./journey";
import { consequence } from "./outcome";
import { BACKGROUNDS, clearProfile, loadProfile, saveProfile, type Profile } from "./profile";
import { planRun } from "./questions";
import { ACCESSORIES, DEMO_CHARACTER } from "./sprite";
import { tailorStage, travelMinutes } from "./tailor";
import type { PlayableStage } from "./types";

const firstJob = STAGES.find((s) => s.id === "first-job")! as PlayableStage;
afterEach(() => vi.unstubAllGlobals());

/** Everything a run's numbers and scoring depend on, for one profile and one look. */
function snapshot(profile: Profile, accessory: (typeof ACCESSORIES)[number] = "none") {
  const character = { ...DEMO_CHARACTER, appearance: { ...DEMO_CHARACTER.appearance, accessory } };
  return JSON.stringify({
    listings: listingsFor(firstJob, "normal", DEMO_SEED, MODES.base.listings).map((l) => [l.id, l.answer, l.rentCents, l.benchmarkCents]),
    scams: listingsFor(firstJob, "normal", DEMO_SEED, MODES.extended.listings).filter((l) => l.answer !== "legit").length,
    offers: tailorStage(firstJob, profile).stage.offers.map((o) => [o.id, o.rentCents, o.commuteMinutes, o.utilities, o.reveal]),
    month: firstJob.offers.map((o) => consequence({ character, stage: firstJob, offerId: o.id, revealed: true, profile }).fields.map((f) => [f.label, f.value, f.status])),
    lease: leaseFor("s2-a", DEMO_SEED, 160_000, "normal").map((c) => c.id),
    score: reportCard({ scams: { correct: 1, total: 2 }, unknownCostFound: false, photos: true, events: { best: 1, total: 1, levels: 0 }, receipts: [] }),
    events: planRun(DEMO_SEED, "extended").events,
  });
}

describe("identity never changes prices, offers, landlords, scams or scoring (PRD v4 Change 4)", () => {
  it("pronouns, languages, background and culture-related look give identical results for the same seed", () => {
    const stated: Profile = { workplace: "york-u", schedule: "hybrid", income: "35-50", household: "partner", pets: false };
    const base = snapshot(stated);
    const identities: Profile[] = [
      { pronouns: "she/her" },
      { pronouns: "they/them", languages: "Tamil, English" },
      { languages: "Tagalog" },
      ...BACKGROUNDS.map((b) => ({ background: b.id })),
    ];
    for (const id of identities) expect(snapshot({ ...stated, ...id }), JSON.stringify(id)).toEqual(base);
    for (const acc of ACCESSORIES) expect(snapshot(stated, acc), acc).toEqual(base);
  });
  it("the game works with every field empty, exactly as before profiles existed", () => {
    expect(snapshot({})).toEqual(snapshot({ interests: [], needs: [], nearby: [] }));
    const c = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-b", revealed: true });
    expect(c).toEqual(consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-b", revealed: true, profile: {} }));
  });
});

describe("what the player states does change their situation", () => {
  it("workplace: commute comes from the routing snapshot, labelled derived with its source", () => {
    const t = tailorStage(firstJob, { workplace: "utsc" });
    expect(t.stage.offers.find((o) => o.id === "s2-a")!.commuteMinutes).toBe(travelMinutes(24, "utsc"));
    const c = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-a", revealed: true, profile: { workplace: "utsc" } });
    const commute = c.fields.find((f) => f.label === "Commute, one way")!;
    expect(commute.status).toBe("derived");
    expect(commute.source_url).toMatch(/^https:/);
  });
  it("the default downtown hero values are the routed medians to Union Station", () => {
    for (const o of firstJob.offers) expect(travelMinutes(o.neighbourhoodId, "union")).toBe(o.commuteMinutes);
  });
  it("schedule: remote means no commute trips or fares; hybrid fewer", () => {
    const remote = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-a", revealed: true, profile: { schedule: "remote" } });
    expect(remote.fareCents).toBe(0);
    expect(remote.commuteHours).toBe(0);
    const office = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-a", revealed: true, profile: { schedule: "9-5" } });
    const hybrid = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-a", revealed: true, profile: { schedule: "hybrid" } });
    expect(hybrid.commuteHours).toBeLessThan(office.commuteHours);
  });
  it("income band: marked as the player's own input; 'typical' keeps the illustrative figure", () => {
    const own = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-a", revealed: true, profile: { income: "35-50" } });
    expect(own.fields.find((f) => f.label.startsWith("Monthly income"))!.status).toBe("player_input");
    const typical = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-a", revealed: true, profile: { income: "typical" } });
    expect(typical.fields.find((f) => f.label.startsWith("Monthly income"))!.status).not.toBe("player_input");
    expect(typical.monthlyIncomeCents).toBe(consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-a", revealed: true }).monthlyIncomeCents);
  });
  it("pets: the lease includes the no-pets clause to spot", () => {
    for (const seed of [1, 2, 3, 4, 5]) expect(leaseFor("s2-b", seed, 1, "easy", ["no-pets"]).map((c) => c.id)).toContain("no-pets");
  });
  it("newcomer: the no-credit-history question is asked in Extended", () => {
    expect(planRun(9, "extended", [], [], { newcomer: true }).viewing).toContain("newcomer-credit");
  });
});

describe("privacy: the profile stays on the device and can be cleared", () => {
  it("'Clear my profile' removes everything stored", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    saveProfile({ pronouns: "he/him", workplace: "union", nearbyOther: "Kensington Market" });
    expect(loadProfile().workplace).toBe("union");
    clearProfile();
    expect(store.size).toBe(0);
    expect(loadProfile()).toEqual({});
  });
  it("unknown values and long or rude free text never get stored", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    saveProfile({ workplace: "mars" as never, nearbyOther: "x".repeat(200), languages: "shit" });
    const p = loadProfile();
    expect(p.workplace).toBeUndefined();
    expect(p.nearbyOther!.length).toBeLessThanOrEqual(40);
    expect(p.languages).toBeUndefined();
  });
});
