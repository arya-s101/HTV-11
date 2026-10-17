import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, displayName, isCode, makeCode, roomQuestions } from "./room";

describe("multiplayer helpers (PRD v4 Change 5)", () => {
  it("room codes are 6 characters with no ambiguous ones", () => {
    for (let i = 0; i < 200; i++) expect(isCode(makeCode())).toBe(true);
    expect(CODE_ALPHABET).not.toMatch(/[0O1IL]/);
  });
  it("display names are short, clean and unique in the room", () => {
    expect(displayName("A".repeat(30), []).length).toBeLessThanOrEqual(16);
    expect(displayName("Sam", ["Sam"])).toBe("Sam2");
    expect(displayName("Sam", ["Sam", "Sam2"])).toBe("Sam3");
    expect(displayName("shit", [])).toBe("Player");
  });
  it("every client builds identical questions and option order from the room seed; keys stay separate", () => {
    const a = roomQuestions(77, "easy");
    expect(roomQuestions(77, "easy")).toEqual(a);
    expect(a.questions).toHaveLength(a.keys.length);
    for (const q of a.questions) expect(Object.keys(q)).not.toContain("accept");
    for (const [i, k] of a.keys.entries()) expect(k.accept.every((x) => x >= 0 && x < a.questions[i].options.length)).toBe(true);
  });
});

describe("room documents", () => {
  it("never contain undefined values (Firestore rejects them)", () => {
    for (const seed of [1, 2, 3, 77]) {
      const { questions, keys } = roomQuestions(seed, "easy");
      const bad = JSON.stringify([questions, keys], (_k, v) => (v === undefined ? "__UNDEFINED__" : v));
      expect(bad).not.toContain("__UNDEFINED__");
      for (const q of questions) for (const v of Object.values(q)) expect(v).not.toBeUndefined();
    }
  });
});

describe("Haggle Time in multiplayer", () => {
  it("every room has one haggle question on the same offer, scored by code from the agreed rent", async () => {
    const { hagglePoints } = await import("./room");
    const { questions, keys } = roomQuestions(5, "easy");
    const i = questions.findIndex((q) => q.negotiateOfferId);
    expect(i).toBeGreaterThan(-1);
    expect(keys[i].askingCents).toBeGreaterThan(0);
    expect(hagglePoints(160_000, 160_000)).toBe(0);
    expect(hagglePoints(160_000, 157_500)).toBe(100);
    expect(hagglePoints(160_000, 100_000)).toBe(200);
    expect(hagglePoints(160_000, 170_000)).toBe(0);
  });
});
