import { afterEach, describe, expect, it, vi } from "vitest";
import { prefetchScenarios } from "../components/show/scenarios";
import { writeScenarios } from "../server/scenarios";
import { SCENARIO_PROFILE_KEYS, sanitizeScenarioProfile, scenarioProfile, type Profile } from "./profile";
import { LISTING_PROSE, OFFER_PROSE, optionsFor, planRun, specFor, TEMPLATES } from "./questions";
import { validateScenario } from "./scenario";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Makes fetch answer like the Gemini API with this JSON as the model's text. */
function geminiReturns(...outputs: unknown[]) {
  const calls: string[] = [];
  let i = 0;
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      calls.push(init.body);
      const out = outputs[Math.min(i++, outputs.length - 1)];
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof out === "string" ? out : JSON.stringify(out) }] } }] }), { status: 200 });
    }),
  );
  return calls;
}

describe("reviewed templates (PRD v4 Change 2)", () => {
  it("every template has ≥2 correct variants, ≥4 distractors, ≥3 fallbacks and a reviewer", () => {
    for (const t of TEMPLATES) {
      expect(t.correct_variants.length, t.id).toBeGreaterThanOrEqual(2);
      expect(t.distractors.length, t.id).toBeGreaterThanOrEqual(4);
      expect(t.fallback_scenarios.length, t.id).toBeGreaterThanOrEqual(3);
      expect(t.reviewed_by, t.id).toBeTruthy();
      for (const d of t.distractors) expect(t.correct_variants, `${t.id}: distractor equals an answer`).not.toContain(d);
    }
  });
  it("reviewed listing prose expresses every feature code chose for it", () => {
    for (const [id, p] of [...Object.entries(LISTING_PROSE), ...Object.entries(OFFER_PROSE)]) {
      expect(p.fallback_scenarios.length, id).toBeGreaterThanOrEqual(3);
      for (const f of p.fallback_scenarios) expect(validateScenario({ scenario: f }, specFor({ id, kind: LISTING_PROSE[id] ? "listing" : "offer" }, false)), `${id}: ${f}`).toMatchObject({ ok: true });
    }
  });
  it("correct answers always come from correct_variants; every option is reviewed text (no Gemini-written options)", () => {
    for (const t of TEMPLATES)
      for (let seed = 1; seed <= 40; seed++) {
        const opts = optionsFor(t, seed);
        expect(opts.filter((o) => o.correct)).toHaveLength(1);
        expect(t.correct_variants).toContain(opts.find((o) => o.correct)!.label);
        for (const o of opts.filter((x) => !x.correct)) expect(t.distractors).toContain(o.label);
      }
  });
});

describe("variety without repetition", () => {
  it("two consecutive games show different scenarios or option sets/orders for the same round", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = planRun(seed, "base");
      const b = planRun(seed + 1, "base", Object.keys(a.questions));
      const sig = (p: typeof a, id: string) => JSON.stringify([p.questions[id].fallback, p.questions[id].options.map((o) => o.label)]);
      expect(sig(a, a.movein)).not.toEqual(sig(b, b.movein));
      expect(a.events[0] === b.events[0] ? sig(a, a.events[0]) !== sig(b, b.events[0]) : true).toBe(true);
    }
  });
  it("prefers templates not seen in recent games", () => {
    const first = planRun(5, "extended");
    const next = planRun(6, "extended", first.events);
    for (const id of next.events) expect(first.events).not.toContain(id);
  });
});

describe("validation: anything off falls back", () => {
  const q = specFor({ id: "repair-writing", kind: "question" }, false);
  const scam = specFor({ id: "scam-overseas", kind: "listing" }, false);
  it("accepts a clean scenario", () => {
    expect(validateScenario({ scenario: "The fridge hums, then goes quiet.", host_line: "Uh oh!" }, q).ok).toBe(true);
  });
  it.each([
    ["digits", { scenario: "The fridge broke after 3 days." }, q],
    ["unknown placeholder", { scenario: "The {fridge} broke." }, q],
    ["place when not allowed", { scenario: "The tap broke near {place}." }, q],
    ["too many lines", { scenario: "One. Two. Three." }, q],
    ["legal claim", { scenario: "That's illegal, and the law says they must fix it." }, q],
    ["rights claim", { scenario: "You have the right to a working fridge." }, q],
    ["profanity", { scenario: "The damn shitty fridge died." }, q],
    ["not an object", "just text", q],
    ["missing scenario", { host_line: "Hi!" }, q],
    ["missing required feature", { scenario: "Lovely place for {rent}. Viewings any time." }, scam],
    ["long line", { scenario: "This is a very long sentence that keeps going and going well past the fifteen word limit for the screen." }, q],
  ])("rejects %s", (_name, raw, spec) => {
    expect(validateScenario(raw, spec).ok).toBe(false);
  });

  it("server: bad output is retried once, then left to the fallback", async () => {
    const calls = geminiReturns({ items: [{ id: "repair-writing", scenario: "It broke 2 times." }] });
    const r = await writeScenarios([{ id: "repair-writing", kind: "question" }], {}, { allowPlace: false, listing: false });
    expect(calls).toHaveLength(2);
    expect(r.items).toEqual({});
    expect(r.source).toBe("fallback");
  });
  it("server: invalid JSON from the model falls back", async () => {
    geminiReturns("not json at all");
    const r = await writeScenarios([{ id: "heat", kind: "question" }], {}, { allowPlace: false, listing: false });
    expect(r.items).toEqual({});
  });
  it("server: a valid scenario on the retry is used", async () => {
    geminiReturns({ items: [{ id: "heat", scenario: "Cold 4 days." }] }, { items: [{ id: "heat", scenario: "Your radiators are cold again.", host_line: "Brr!" }] });
    const r = await writeScenarios([{ id: "heat", kind: "question" }], {}, { allowPlace: false, listing: false });
    expect(r.items.heat).toEqual({ scenario: "Your radiators are cold again.", host_line: "Brr!" });
  });
  it("server: never calls the model without a key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const r = await writeScenarios([{ id: "heat", kind: "question" }], {}, { allowPlace: false, listing: false });
    expect(f).not.toHaveBeenCalled();
    expect(r.source).toBe("fallback");
  });
});

describe("client: with the API blocked, the game keeps its fallbacks", () => {
  it("a rejected fetch never throws and adds nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("blocked"))));
    const got = vi.fn();
    await expect(prefetchScenarios([[{ id: "heat", kind: "question" }]], {}, got)).resolves.toBeUndefined();
    expect(got).not.toHaveBeenCalled();
  });
  it("a server answer is validated again before use", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: { heat: { scenario: "Cold for 3 days." }, smoke: { scenario: "The alarm stays silent." } } }))));
    const got = vi.fn();
    await prefetchScenarios([[{ id: "heat", kind: "question" }, { id: "smoke", kind: "question" }]], {}, got);
    expect(got).toHaveBeenCalledWith({ smoke: { scenario: "The alarm stays silent." } });
  });
});

describe("privacy: what a scenario request may contain (PRD v4 Change 4)", () => {
  const full: Profile = {
    pronouns: "they/them",
    workplace: "union",
    schedule: "shifts",
    income: "50-70",
    household: "roommates",
    pets: true,
    needs: ["elevator"],
    nearby: ["A place of worship"],
    nearbyOther: "Kensington Market",
    interests: ["Music"],
    background: "newcomer",
    languages: "Tamil, English",
    renting: "first",
  };
  it("only allowed fields are sent; never name, pronouns, languages or background detail", async () => {
    let body = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: { body: string }) => {
        body = init.body;
        return new Response(JSON.stringify({ items: {} }));
      }),
    );
    await prefetchScenarios([[{ id: "heat", kind: "question" }]], scenarioProfile("Nurse", full), () => {});
    const sent = JSON.parse(body).profile;
    for (const k of Object.keys(sent)) expect(SCENARIO_PROFILE_KEYS).toContain(k);
    expect(body).not.toMatch(/they\/them|Tamil|newcomer to canada|grew up/i);
    expect(sent.newcomer).toBe(true);
    expect(sent.wants_nearby).toContain("Kensington Market");
  });
  it("multiplayer rooms send no profile at all", async () => {
    let body = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: { body: string }) => {
        body = init.body;
        return new Response(JSON.stringify({ items: {} }));
      }),
    );
    await prefetchScenarios([[{ id: "heat", kind: "question" }]], scenarioProfile("Nurse", full), () => {}, "ABCDEF");
    expect(JSON.parse(body).profile).toEqual({});
  });
  it("the server drops anything it wasn't expecting", () => {
    const s = sanitizeScenarioProfile({ career: "Nurse", name: "Sam", pronouns: "she/her", languages: ["Tamil"], needs: ["Elevator", 7], pets: "yes" });
    expect(s).toEqual({ career: "Nurse", needs: ["Elevator"] });
  });
});
