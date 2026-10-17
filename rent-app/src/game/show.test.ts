import { describe, expect, it } from "vitest";
import showJson from "../../data/game/show.json";
import { evidenceFor, STAGES } from "./data";
import { CONTENT, J, listingsFor } from "./journey";
import { TEMPLATES } from "./questions";
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
  it("question templates: every fallback scenario fits with its prompt; options and reasons are one short line", () => {
    for (const t of TEMPLATES) {
      for (const f of t.fallback_scenarios) ok([...sentences(f), t.prompt], `${t.id} fallback`);
      for (const o of [...t.correct_variants, ...t.distractors]) ok([o], `${t.id} option`);
      if (t.level_why) ok([t.level_why], `${t.id} level`);
      if (t.photos_matter) ok([t.photos_matter.with, t.photos_matter.without], `${t.id} photos`);
    }
  });
  it("apply, lease and move-out lines", () => {
    ok([J.apply.rival.text], "rival");
    for (const o of J.apply.rival.options) ok(o.outcome as unknown as string[], o.id);
    for (const d of J.apply.docs) ok([d.label], d.id);
    for (const c of J.lease.clauses) ok([c.plain, ...((c as { why?: string }).why ? [(c as { why?: string }).why!] : [])], c.id);
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

describe("PRD v4 Change 3: no timers, unlimited skip", () => {
  it("has no timer data or timer code left in the game", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const files = ["src/components/show", "src/game", "src/config"].flatMap((d) => readdirSync(d).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts")).map((f) => `${d}/${f}`));
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/useCountdown|TimerBadge|LISTING_SECONDS|timeout"/);
    expect(JSON.stringify(J)).not.toMatch(/"seconds"/);
  });
  it("the limited Free Pass lifeline is gone; Skip replaces it", () => {
    expect(showJson.lifelines.map((l) => l.id)).toEqual(["hint", "magnify"]);
  });
});
