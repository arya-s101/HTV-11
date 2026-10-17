// Rich character profile (PRD v4 Change 4). Every field is optional and stays on this device.
// Tailoring rule: use only what the player explicitly states as a preference or need; never infer anything from
// identity. Identity fields (pronouns, languages, background other than the newcomer flag, culture-related look)
// never change prices, offers, landlord behaviour, difficulty, scam frequency or score.
import { cleanFreeText } from "./scenario";

export const WORKPLACES = [
  { id: "union", label: "Downtown (Union Station)" },
  { id: "toronto-general", label: "Hospital district (Toronto General)" },
  { id: "north-york-centre", label: "North York Centre" },
  { id: "york-u", label: "York University" },
  { id: "utsc", label: "U of T Scarborough" },
] as const;
export type WorkplaceId = (typeof WORKPLACES)[number]["id"];

export const SCHEDULES = [
  { id: "9-5", label: "9 to 5, in person" },
  { id: "hybrid", label: "Hybrid (3 days in)" },
  { id: "shifts", label: "Shifts, incl. late nights" },
  { id: "remote", label: "Remote" },
] as const;
export type ScheduleId = (typeof SCHEDULES)[number]["id"];

export const HOUSEHOLDS = [
  { id: "alone", label: "Living alone" },
  { id: "roommates", label: "With roommates" },
  { id: "partner", label: "With a partner" },
  { id: "kids", label: "With kids" },
] as const;
export type HouseholdId = (typeof HOUSEHOLDS)[number]["id"];

export const NEEDS = [
  { id: "step-free", label: "Step-free access" },
  { id: "elevator", label: "Elevator" },
  { id: "parking", label: "Parking" },
  { id: "quiet", label: "Quiet" },
  { id: "laundry", label: "In-unit laundry" },
] as const;
export type NeedId = (typeof NEEDS)[number]["id"];

export const NEARBY = ["A grocery store I like", "A place of worship", "A community centre", "A park", "A gym", "Nightlife", "My cultural community", "Family or friends"] as const;
export const INTERESTS = ["Cooking", "Music", "Gaming", "Sports", "Art", "Reading", "Fitness", "Film"] as const;
export const BACKGROUNDS = [
  { id: "newcomer", label: "Newcomer to Canada" },
  { id: "international-student", label: "International student" },
  { id: "toronto", label: "Grew up in Toronto" },
  { id: "elsewhere-canada", label: "Moved from elsewhere in Canada" },
] as const;
export type BackgroundId = (typeof BACKGROUNDS)[number]["id"];

/** Annual income bands the player can pick; the midpoint feeds the calculation as status "player_input". */
export const INCOME_BANDS = [
  { id: "under-35", label: "Under $35k", midCents: 30_000_00 },
  { id: "35-50", label: "$35k–50k", midCents: 42_500_00 },
  { id: "50-70", label: "$50k–70k", midCents: 60_000_00 },
  { id: "70-90", label: "$70k–90k", midCents: 80_000_00 },
  { id: "90-plus", label: "$90k or more", midCents: 100_000_00 },
] as const;
export type IncomeBandId = (typeof INCOME_BANDS)[number]["id"];

export interface Profile {
  pronouns?: string;
  workplace?: WorkplaceId;
  schedule?: ScheduleId;
  income?: IncomeBandId | "typical";
  household?: HouseholdId;
  pets?: boolean;
  needs?: NeedId[];
  nearby?: string[];
  nearbyOther?: string;
  interests?: string[];
  background?: BackgroundId;
  languages?: string;
  renting?: "first" | "before";
}

const KEY = "trd.profile";

/** Reads the saved profile; any storage problem gives an empty profile. */
export function loadProfile(): Profile {
  try {
    return sanitizeProfile(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return {};
  }
}
export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sanitizeProfile(p)));
  } catch {
    // not remembered
  }
}
export function clearProfile() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing stored
  }
}

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => (allowed.includes(v as T) ? (v as T) : undefined);
const ids = <T extends { id: string }>(xs: readonly T[]) => xs.map((x) => x.id) as T["id"][];

/** Drops unknown values and cleans free text, so nothing unexpected is stored or sent. */
export function sanitizeProfile(raw: unknown): Profile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown, allowed: readonly string[]) => (Array.isArray(v) ? v.filter((x) => allowed.includes(x)) : undefined);
  const p: Profile = {
    pronouns: typeof r.pronouns === "string" ? cleanFreeText(r.pronouns, 20) || undefined : undefined,
    workplace: pick(r.workplace, ids(WORKPLACES)),
    schedule: pick(r.schedule, ids(SCHEDULES)),
    income: pick(r.income, [...ids(INCOME_BANDS), "typical"] as const),
    household: pick(r.household, ids(HOUSEHOLDS)),
    pets: typeof r.pets === "boolean" ? r.pets : undefined,
    needs: list(r.needs, ids(NEEDS)) as NeedId[] | undefined,
    nearby: list(r.nearby, NEARBY),
    nearbyOther: typeof r.nearbyOther === "string" ? cleanFreeText(r.nearbyOther, 40) || undefined : undefined,
    interests: list(r.interests, INTERESTS),
    background: pick(r.background, ids(BACKGROUNDS)),
    languages: typeof r.languages === "string" ? cleanFreeText(r.languages, 40) || undefined : undefined,
    renting: pick(r.renting, ["first", "before"] as const),
  };
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) as Profile;
}

/** What may be sent to Gemini for scenario flavour. Never: name, pronouns, languages, background beyond the newcomer flag, free-text identity. */
export interface ScenarioProfile {
  career?: string;
  schedule?: string;
  household?: string;
  pets?: boolean;
  needs?: string[];
  interests?: string[];
  wants_nearby?: string[];
  newcomer?: boolean;
  first_time_renter?: boolean;
}

export function scenarioProfile(career: string | undefined, p: Profile): ScenarioProfile {
  const out: ScenarioProfile = {
    career: career ? cleanFreeText(career, 40) || undefined : undefined,
    schedule: p.schedule ? SCHEDULES.find((s) => s.id === p.schedule)!.label : undefined,
    household: p.household ? HOUSEHOLDS.find((h) => h.id === p.household)!.label : undefined,
    pets: p.pets,
    needs: p.needs?.map((n) => NEEDS.find((x) => x.id === n)!.label),
    interests: p.interests,
    // "Wants nearby" is a stated preference, so it may be used; the free-text entry is cleaned and length-limited.
    wants_nearby: [...(p.nearby ?? []), ...(p.nearbyOther ? [p.nearbyOther] : [])],
    newcomer: p.background ? p.background === "newcomer" || p.background === "international-student" : undefined,
    first_time_renter: p.renting ? p.renting === "first" : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) as ScenarioProfile;
}

export const SCENARIO_PROFILE_KEYS = ["career", "schedule", "household", "pets", "needs", "interests", "wants_nearby", "newcomer", "first_time_renter"] as const;

/** Server-side check of a received payload: only the allowed keys, short strings, nothing else survives. */
export function sanitizeScenarioProfile(raw: unknown): ScenarioProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? cleanFreeText(v, 40) || undefined : undefined);
  const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((x): x is string => !!x).slice(0, 8) : undefined);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  const out: ScenarioProfile = {
    career: str(r.career),
    schedule: str(r.schedule),
    household: str(r.household),
    pets: bool(r.pets),
    needs: strs(r.needs),
    interests: strs(r.interests),
    wants_nearby: strs(r.wants_nearby),
    newcomer: bool(r.newcomer),
    first_time_renter: bool(r.first_time_renter),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) as ScenarioProfile;
}
