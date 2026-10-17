import { describe, expect, it } from "vitest";
import showJson from "../../data/game/show.json";
import { evidenceFor, STAGES } from "./data";
import { CONTENT, J, listingsFor } from "./journey";
import { consequence } from "./outcome";
import { buildCityQuestion, buildQuestion } from "./question";
import { DEMO_CHARACTER } from "./sprite";
import type { PlayableStage } from "./types";

const words = (s: string) => s.trim().split(/\s+/).length;
const sentences = (t: string) => t.match(/[^.!?]+[.!?]*["”]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [t];
const firstJob = STAGES.find((s) => s.id === "first-job")! as PlayableStage;
const ok = (lines: string[], where: string) => {
  expect(lines.length, `${where}: too many lines`).toBeLessThanOrEqual(3);
  for (const l of lines) expect(words(l), `${where}: "${l}"`).toBeLessThanOrEqual(15);
};

describe("game-show text rules (PRD v2 §5.10): ≤3 lines of ≤15 words outside a Why? drawer", () => {
  it("content shorts", () => {
    for (const c of CONTENT) ok([c.short], c.id);
  });
  it("host script", () => {
    ok(showJson.welcome, "welcome");
    for (const [id, r] of Object.entries(showJson.rounds)) ok([r.title, ...r.intro], id);
    for (const q of [...showJson.reactions.correct, ...showJson.reactions.wrong]) ok([q], "reaction");
  });
  it("listings on Easy and Normal (Hard fine print is the deliberate exception)", () => {
    for (const d of ["easy", "normal"] as const) for (const l of listingsFor(firstJob, d, 1).concat(listingsFor(firstJob, d, 2))) ok(sentences(l.text), `${d} ${l.id}`);
  });
  it("events, feedback and levels", () => {
    for (const e of J.events) {
      ok([e.text, "What do you do?"], e.id);
      for (const a of e.actions) ok([a.label], `${e.id} action`);
      for (const fb of Object.values(e.feedback as unknown as Record<string, string[]>)) ok(fb, `${e.id} feedback`);
      ok([e.levelWhy], `${e.id} level`);
    }
  });
  it("apply, lease and move-out lines", () => {
    ok([J.apply.rival.text], "rival");
    for (const o of J.apply.rival.options) ok(o.outcome as unknown as string[], o.id);
    for (const d of J.apply.docs) ok([d.label], d.id);
    for (const c of J.lease.clauses) ok([c.plain, ...((c as { why?: string }).why ? [(c as { why?: string }).why!] : [])], c.id);
    for (const fb of Object.values(J.moveOut.feedback as unknown as Record<string, string[]>)) ok(fb, "moveout");
  });
  it("move-in surprises and candidate-question asks", () => {
    for (const o of firstJob.offers) ok(o.reveal.lines, `${o.id} reveal`);
    const c = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-b", revealed: true });
    const ev = evidenceFor(162);
    for (const q of [buildQuestion(firstJob, c, ev, "reliability"), buildQuestion(firstJob, c, ev, "frequency"), buildCityQuestion("heat", ev), buildCityQuestion("repairs", ev)]) ok(q.short, q.stageId);
  });
  it("uses no real TV game-show names", () => {
    const all = JSON.stringify(showJson).toLowerCase();
    for (const banned of ["jeopardy", "wheel of fortune", "price is right", "let's make a deal", "family feud", "who wants to be a millionaire", "deal or no deal", "phone a friend"]) expect(all).not.toContain(banned);
  });
});
