import { describe, expect, it } from "vitest";
import { MODES } from "../config/modes";
import { STAGES } from "../game/data";
import { listingsFor } from "../game/journey";
import { planRun } from "../game/questions";
import { hagglePoints } from "../game/score";
import type { PlayableStage } from "../game/types";
import { CODE_ALPHABET, displayName, isCode, makeCode } from "./room";

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
});

describe("parity: every player in a room gets the single-player game, identically", () => {
  const stage = STAGES.find((s) => s.journey)! as PlayableStage;
  it("the same room seed, mode and difficulty give every client the same questions, options and listings", () => {
    for (const mode of ["base", "extended"] as const) {
      expect(planRun(1234, mode)).toEqual(planRun(1234, mode));
      expect(listingsFor(stage, "normal", 1234, MODES[mode].listings)).toEqual(listingsFor(stage, "normal", 1234, MODES[mode].listings));
    }
  });
  it("haggling scores the same way everywhere", () => {
    expect(hagglePoints(160_000, 160_000)).toBe(0);
    expect(hagglePoints(160_000, 157_500)).toBe(100);
    expect(hagglePoints(160_000, 100_000)).toBe(200);
    expect(hagglePoints(160_000, 170_000)).toBe(0);
  });
});
