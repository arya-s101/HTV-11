// RentSafeTO evaluation records -> one latest evaluation per building, keeping history.
// A building with no record is "unknown", never "unsafe"; a score is building condition only.

export interface RentSafeRecord {
  RSN: number | string;
  "SITE ADDRESS": string;
  "EVALUATION COMPLETED ON": string;
  "CURRENT BUILDING EVAL SCORE": number | string | null;
  LATITUDE?: number | string | null;
  LONGITUDE?: number | string | null;
}

export interface BuildingEvaluation {
  rsn: number;
  address: string;
  latest: { date: string; score: number | null };
  history: { date: string; score: number | null }[];
}

const num = (v: unknown) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

export function latestByBuilding(records: RentSafeRecord[]): Map<number, BuildingEvaluation> {
  const out = new Map<number, BuildingEvaluation>();
  for (const r of records) {
    const rsn = Number(r.RSN);
    const entry = { date: String(r["EVALUATION COMPLETED ON"]).slice(0, 10), score: num(r["CURRENT BUILDING EVAL SCORE"]) };
    const b = out.get(rsn) ?? { rsn, address: r["SITE ADDRESS"].trim(), latest: entry, history: [] };
    b.history.push(entry);
    if (entry.date >= b.latest.date) {
      b.latest = entry;
      b.address = r["SITE ADDRESS"].trim();
    }
    out.set(rsn, b);
  }
  for (const b of out.values()) b.history.sort((a, c) => a.date.localeCompare(c.date));
  return out;
}
