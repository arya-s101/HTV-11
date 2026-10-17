// Shared types. Every number shown to the player is a Field with provenance (PRD §6).

export type Status = "measured" | "derived" | "illustrative" | "unknown";

export interface Field<T> {
  value: T | null; // null when status === "unknown"
  unit: string; // "CAD cents/month", "minutes", "%", "hours/month"
  geography: string;
  reference_period: string;
  source_url: string | null;
  status: Status;
  source_ref?: string;
}

/** A Field with a display label and optional explanation of how it was made. */
export type Shown = Field<number> & { label: string; note?: string };

export type VerifyItemId = "utilities" | "commute-timing" | "rent-control" | "fees";
export type CivicCategory = "personal" | "municipal" | "non-municipal";
export type StandardKey = "frequency" | "reliability";
export type Difficulty = "easy" | "normal" | "hard";

export interface RouteLeg {
  mode: "walk" | "bus" | "streetcar" | "subway";
  label: string;
  minutes: number;
}

export interface Offer {
  id: string;
  title: string;
  neighbourhoodId: number;
  unitType: string;
  cmhcBedroom: string;
  rentCents: number;
  utilities: { status: "unknown" | "illustrative"; includedInRent?: boolean; note: string };
  commuteMinutes: number;
  unknowns: VerifyItemId[];
  reveal: { id: VerifyItemId; headline: string; text: string; extraMonthlyCents: number; lines: string[] };
  /** How the same facts are shown at Normal (ad copy) and Hard (fine print + route legs). */
  presentation: { listingText: string; finePrint: string; routeLegs: RouteLeg[] };
}

/** Terms agreed in an optional negotiation; absent = the listed terms. */
export interface NegotiatedTerms {
  rentCents: number;
  askingCents: number;
  utilitiesIncluded: boolean;
  concessions: { id: string; label: string }[];
}

export interface CivicCard {
  id: string;
  text: string;
  correct: CivicCategory;
  leverId: string | null;
  standard?: StandardKey;
}

export interface Stage {
  id: string;
  order: number;
  title: string;
  defaultAge: number;
  ageRange: [number, number];
  enabled: boolean;
  /** Runs the full eight-phase rental journey (PRD v2) instead of the single-decision flow. */
  journey?: boolean;
  housingNeed: string;
  household?: string;
  destination?: { id: string; name: string };
  income?: { amountCents: number; period: "annual" | "monthly"; basis: "gross" | "net"; description: string };
  commuteDaysPerMonth?: number;
  fareOptions?: ("adult-payg" | "post-secondary-pass")[];
  leverId: string;
  offers?: Offer[];
  civicCards?: CivicCard[];
}

/** A stage that has all the data needed to be played. */
export type PlayableStage = Required<Stage>;

export interface LeverSource {
  title: string;
  url: string;
  retrievedOn: string;
  supports: string;
}

export interface Lever {
  id: string;
  name: string;
  jurisdiction: "municipal" | "provincial" | "shared";
  sourced: boolean;
  summary: string;
  standards?: Record<StandardKey | "review", string>;
  sources: LeverSource[];
}

export interface CmhcTable {
  title: string;
  reference_period: string;
  source_url: string;
  columns: string[];
  rows: { zoneCode: string; zoneLabel: string; cells: Record<string, { value: number | null; quality: string | null; cell: string }> }[];
}

export interface NeighbourhoodEvidence {
  id: number;
  name: string;
  zone: { code: string; label: string; assignment: string };
  cmhcRent: Record<string, Field<number>>;
  tenantShelter30: Field<number>;
  medianRentedShelterCost: Field<number>;
}
