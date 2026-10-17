// Game modes (PRD v3 Change 1). Rounds are shared; a mode only picks which run, in what order, and how many items each has.
export type Mode = "base" | "extended";
export type RoundId = "search" | "viewing" | "apply" | "negotiate" | "lease" | "movein" | "live" | "moveout" | "report";

export interface ModeConfig {
  label: string;
  blurb: string;
  rounds: RoundId[];
  /** Listings shown in Spot the Fake. Base shows scams only among the bad ones, so one is always benchmark-detectable. */
  listings: { legit: number; bad: number; scamsOnly: boolean };
  /** Offers in Pick Your Place (null = every offer in the stage). */
  offerIds: string[] | null;
  /** Ask who to report a scam to after the listings. */
  scamReport: boolean;
  /** Quick viewing questions after picking a place (Change 2). */
  viewingQuestions: number;
  /** Where the first-month money/time reveal happens: right after picking (Base), or at move-in after haggling (Extended). */
  revealIn: "viewing" | "movein";
  /** Ask about contents insurance at move-in. */
  insurance: boolean;
  /** Events in Something Breaks / Life Happens. Base draws from the repair events where move-in photos matter. */
  events: number;
  /** Calls that need an LLM besides scenario variety: the haggling landlord and generated job paths (PRD v4: Base may vary scenarios but must work with zero calls). */
  apiCalls: boolean;
}

export const MODES: Record<Mode, ModeConfig> = {
  base: {
    label: "Base game",
    blurb: "About 4 minutes. The vital lessons, plus haggling.",
    // Haggling is the flagship feature, so Base includes it; the first-month numbers follow the deal (move-in).
    rounds: ["search", "viewing", "negotiate", "movein", "live", "report"],
    listings: { legit: 2, bad: 1, scamsOnly: true },
    offerIds: ["s2-a", "s2-b"],
    scamReport: false,
    viewingQuestions: 0,
    revealIn: "movein",
    insurance: false,
    events: 1,
    apiCalls: true, // the haggling landlord may use Gemini; a scripted landlord covers no key and the demo
  },
  extended: {
    label: "Extended game",
    blurb: "About 10 minutes. All eight phases, with haggling.",
    rounds: ["search", "viewing", "apply", "negotiate", "lease", "movein", "live", "moveout", "report"],
    listings: { legit: 2, bad: 2, scamsOnly: false },
    offerIds: null,
    scamReport: true,
    viewingQuestions: 3,
    revealIn: "movein",
    insurance: true,
    events: 3,
    apiCalls: true,
  },
};

/** Base rounds that Extended can skip when the player has just finished Base with the same character. */
export const SKIPPABLE_AFTER_BASE: RoundId[] = ["search"];
