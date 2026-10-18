// Builds data/game/evidence.json: REAL Toronto observations for every neighbourhood a game offer can use.
// Inputs: data/game/stages.json (which neighbourhoods/bedrooms), data/snapshots/*.json, data/raw/nbhd-profiles-2021.xlsx.
// Run: npm run build:evidence
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

type Status = "measured" | "derived" | "illustrative" | "unknown";
interface Field<T> {
  value: T | null;
  unit: string;
  geography: string;
  reference_period: string;
  source_url: string | null;
  status: Status;
  source_ref?: string;
}

const PROFILES_FILE = "data/raw/nbhd-profiles-2021.xlsx";
const PROFILES_URL =
  "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/6e19a90f-971c-46b3-852c-0c48c436d1fc/resource/19d4a806-7385-4889-acf2-256f1e079060/download/nbhd_2021_census_profile_full_158model.xlsx";
// Indicator rows (1-based) in sheet hd2021_census_profile; labels are asserted below so a changed file fails loudly.
const ROW_TENANT_30 = 378;
const ROW_MEDIAN_RENTED = 380;

const stages = JSON.parse(readFileSync("data/game/stages.json", "utf8"));
const nbSnap = JSON.parse(readFileSync("data/snapshots/neighbourhoods.json", "utf8"));
const cmhc = JSON.parse(readFileSync("data/snapshots/cmhc-rents-2025.json", "utf8"));

const wb = XLSX.readFile(PROFILES_FILE);
const ws = wb.Sheets["hd2021_census_profile"];
const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
const label = (r: number) => String(rows[r - 1][0]).trim();
if (label(ROW_TENANT_30) !== "% of tenant households spending 30% or more of its income on shelter costs") throw new Error(`Row ${ROW_TENANT_30} label changed: ${label(ROW_TENANT_30)}`);
if (label(ROW_MEDIAN_RENTED) !== "Median monthly shelter costs for rented dwellings ($)") throw new Error(`Row ${ROW_MEDIAN_RENTED} label changed`);
const idRow = rows[1];

const wanted = new Map<number, Set<string>>();
for (const s of stages.stages) for (const o of s.offers ?? []) {
  if (!wanted.has(o.neighbourhoodId)) wanted.set(o.neighbourhoodId, new Set());
  wanted.get(o.neighbourhoodId)!.add(o.cmhcBedroom);
}

// Every neighbourhood whose CMHC zone publishes a 1-bedroom average, so games can draw fresh locations (randomized per seed).
for (const nb of nbSnap.neighbourhoods as { id: number; zoneCode: string }[]) {
  const zone = cmhc.zones.find((z: { zoneCode: string }) => z.zoneCode === nb.zoneCode);
  if (!zone?.inCityOfToronto || zone.benchmarks["1br"]?.vacant?.suppressed !== false) continue;
  if (!wanted.has(nb.id)) wanted.set(nb.id, new Set());
  wanted.get(nb.id)!.add("1br");
}

const BEDROOM_LABEL: Record<string, string> = { studio: "bachelor (studio)", "1br": "1-bedroom", "2br": "2-bedroom", "3br+": "3+ bedroom" };
const neighbourhoods: Record<string, unknown> = {};

for (const [id, bedrooms] of wanted) {
  const nb = nbSnap.neighbourhoods.find((n: { id: number }) => n.id === id);
  if (!nb) throw new Error(`Neighbourhood ${id} not in snapshot`);
  const col = idRow.findIndex((v) => Number(v) === id);
  if (col < 1) throw new Error(`Neighbourhood ${id} not in profiles`);
  // Names differ only in punctuation across the two City files (e.g. "O`Connor Parkview" vs "O'Connor-Parkview").
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (norm(String(rows[0][col])) !== norm(nb.name)) throw new Error(`Profile name mismatch for ${id}: ${rows[0][col]} vs ${nb.name}`);
  const zone = cmhc.zones.find((z: { zoneCode: string }) => z.zoneCode === nb.zoneCode);
  const cellRef = (r: number) => `hd2021_census_profile!${XLSX.utils.encode_cell({ r: r - 1, c: col })}`;
  const geo = `Neighbourhood 158-model #${id} (${nb.name})`;
  const num = (r: number) => (typeof rows[r - 1][col] === "number" ? (rows[r - 1][col] as number) : null);

  const tenant30 = num(ROW_TENANT_30);
  const medianRented = num(ROW_MEDIAN_RENTED);
  const cmhcRent: Record<string, Field<number>> = {};
  for (const b of bedrooms) {
    const m = zone.benchmarks[b].vacant;
    cmhcRent[b] = {
      value: m.suppressed ? null : m.valueCents,
      unit: "CAD cents/month",
      geography: `CMHC Toronto survey ${zone.zoneLabel}`,
      reference_period: "October 2025 Rental Market Survey",
      source_url: cmhc.source.url,
      status: m.suppressed ? "unknown" : "measured",
      source_ref: `${m.cell}; average rent of VACANT private-apartment ${BEDROOM_LABEL[b]} units; quality ${m.quality ?? "n/a (suppressed)"}`,
    };
  }

  neighbourhoods[id] = {
    id,
    name: nb.name,
    zone: {
      code: nb.zoneCode,
      label: zone.zoneLabel,
      assignment: `Largest-area overlap (${Math.round(nb.zoneShare * 100)}% of the neighbourhood) with CMHC's 2026 survey-zone polygons; the 2025 tables use 2021 census zone definitions, so this assignment is provisional.`,
    },
    cmhcRent,
    tenantShelter30: {
      value: tenant30,
      unit: "%",
      geography: geo,
      reference_period: "2021 Census (incomes refer to 2020)",
      source_url: PROFILES_URL,
      status: tenant30 === null ? "unknown" : "measured",
      source_ref: `${cellRef(ROW_TENANT_30)}; % of tenant households spending 30% or more of income on shelter costs`,
    },
    medianRentedShelterCost: {
      value: medianRented === null ? null : medianRented * 100,
      unit: "CAD cents/month",
      geography: geo,
      reference_period: "2021 Census",
      source_url: PROFILES_URL,
      status: medianRented === null ? "unknown" : "measured",
      source_ref: `${cellRef(ROW_MEDIAN_RENTED)}; median monthly shelter costs for rented dwellings`,
    },
  };
}

// Raw CMHC table excerpt for Hard mode: the player reads the right cell themselves.
const cmhcTable = {
  title: cmhc.source.table,
  reference_period: "October 2025 Rental Market Survey",
  source_url: cmhc.source.url,
  columns: ["studio", "1br", "2br"],
  rows: cmhc.zones
    .filter((z: { inCityOfToronto: boolean }) => z.inCityOfToronto)
    .map((z: { zoneCode: string; zoneLabel: string; benchmarks: Record<string, { vacant: { valueCents: number | null; quality: string | null; cell: string } }> }) => ({
      zoneCode: z.zoneCode,
      zoneLabel: z.zoneLabel,
      cells: Object.fromEntries(
        ["studio", "1br", "2br"].map((b) => [b, { value: z.benchmarks[b].vacant.valueCents, quality: z.benchmarks[b].vacant.quality, cell: z.benchmarks[b].vacant.cell }]),
      ),
    })),
};

writeFileSync(
  "data/game/evidence.json",
  JSON.stringify(
    {
      _note: "REAL observations only, generated by scripts/build-game-evidence.ts. Never edit by hand.",
      sources: {
        profiles: { url: PROFILES_URL, sha256: createHash("sha256").update(readFileSync(PROFILES_FILE)).digest("hex"), licence: "Open Government Licence – Toronto" },
        cmhc: { url: cmhc.source.url, sha256: cmhc.source.sha256, licence: "CMHC data; adapted, not endorsed by CMHC" },
      },
      neighbourhoods,
      cmhcTable,
    },
    null,
    2,
  ) + "\n",
);
console.log(`evidence for ${wanted.size} neighbourhoods written`);
