// Builds normalized JSON snapshots in data/snapshots/ from the raw official downloads in data/raw/.
// Run: npm run import:sources   (raw files: see README "Refreshing source data")
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import * as XLSX from "xlsx";
import area from "@turf/area";
import intersect from "@turf/intersect";
import pointOnFeature from "@turf/point-on-feature";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { featureCollection } from "@turf/helpers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

const RAW = "data/raw";
const OUT = "data/snapshots";
mkdirSync(OUT, { recursive: true });

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

// ---------- CMHC Table 1.1.9: vacant vs occupied private apartment rents, Oct 2025 ----------
const CMHC_FILE = `${RAW}/cmhc-toronto-2025.xlsx`;
const SHEET = "Table 1.1.9";
const wb = XLSX.readFile(CMHC_FILE);
const ws = wb.Sheets[SHEET];
const range = XLSX.utils.decode_range(ws["!ref"]!);
const cell = (r: number, c: number) => ws[XLSX.utils.encode_cell({ r, c })]?.v ?? null;
const addr = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

const BEDROOMS = ["studio", "1br", "2br", "3br+"] as const;
// Each bedroom block is 5 columns: vacant, vacantQ, occupied, occupiedQ, Y/N. Studio starts at column B (index 1).
const blockStart = (i: number) => 1 + i * 5;

type Measure = { valueCents: number | null; quality: string | null; suppressed: boolean; cell: string };
const readMeasure = (r: number, c: number): Measure => {
  const v = cell(r, c);
  const q = cell(r, c + 1);
  if (v === "**") return { valueCents: null, quality: null, suppressed: true, cell: `${SHEET}!${addr(r, c)}` };
  if (typeof v !== "number") throw new Error(`Unexpected CMHC value at ${addr(r, c)}: ${v}`);
  return { valueCents: Math.round(v * 100), quality: q || null, suppressed: false, cell: `${SHEET}!${addr(r, c)}` };
};

const zoneRows: Record<string, unknown>[] = [];
for (let r = range.s.r; r <= range.e.r; r++) {
  const label = cell(r, 0);
  if (typeof label !== "string") continue;
  const m = label.match(/^Zone (\d+) - (.+)$/);
  if (!m) continue;
  const zoneNum = Number(m[1]);
  const benchmarks: Record<string, unknown> = {};
  BEDROOMS.forEach((b, i) => {
    const c = blockStart(i);
    benchmarks[b] = {
      vacant: readMeasure(r, c),
      occupied: readMeasure(r, c + 2),
      vacantHigherThanOccupied: cell(r, c + 4),
    };
  });
  zoneRows.push({
    zoneCode: String(zoneNum).padStart(2, "0"),
    zoneLabel: label,
    zoneName: m[2],
    inCityOfToronto: zoneNum <= 17,
    sourceRow: r + 1,
    benchmarks,
  });
}
if (zoneRows.length !== 31) throw new Error(`Expected 31 CMHC zones, got ${zoneRows.length}`);

const cmhcSnapshot = {
  source: {
    publisher: "Canada Mortgage and Housing Corporation (CMHC)",
    title: "Rental Market Survey data tables, Toronto, 2025",
    table: cell(1, 0),
    survey: "October 2025",
    population: "Private apartments (purpose-built rental universe). Not condominium, row-house, or room rents.",
    geographyNote: cell(55, 0),
    qualityKey: "a Excellent, b Very Good, c Good, d Poor (use with caution); ** suppressed (kept null, never zero)",
    url: "https://assets.cmhc-schl.gc.ca/sites/cmhc/professional/housing-markets-data-and-research/housing-data-tables/rental-market/rental-market-report-data-tables/2025/rmr-toronto-2025-en.xlsx?rev=f107330e-4620-4462-9027-8c6ff1522f1a",
    sha256: sha256(CMHC_FILE),
    licence: "CMHC data reuse licence; see README attribution notice.",
  },
  zones: zoneRows,
};
writeFileSync(`${OUT}/cmhc-rents-2025.json`, JSON.stringify(cmhcSnapshot, null, 2));

// ---------- Geography: Toronto neighbourhoods (158) -> CMHC survey zones (2026 geography layer) ----------
const NB_FILE = `${RAW}/neighbourhoods.geojson`;
const ZONE_FILE = `${RAW}/cmhc-toronto-zones.geojson`;
const nbs = JSON.parse(readFileSync(NB_FILE, "utf8")) as FeatureCollection<MultiPolygon | Polygon>;
const zonesFc = JSON.parse(readFileSync(ZONE_FILE, "utf8")) as FeatureCollection<MultiPolygon | Polygon>;
const cityZones = zonesFc.features.filter(
  (z) => z.properties!.metropolitan_major_area_cde === "2270" && Number(z.properties!.survey_zone_cde) <= 17,
);
if (cityZones.length !== 17) throw new Error(`Expected 17 City of Toronto zones, got ${cityZones.length}`);

const neighbourhoods = nbs.features.map((f) => {
  const id = Number.parseInt(String(f.properties!.AREA_SHORT_CODE), 10);
  const nbArea = area(f);
  const point = pointOnFeature(f);
  const overlaps = cityZones
    .map((z) => {
      const inter = intersect(featureCollection([f as Feature<Polygon | MultiPolygon>, z as Feature<Polygon | MultiPolygon>]));
      return { zoneCode: z.properties!.survey_zone_cde as string, share: inter ? area(inter) / nbArea : 0 };
    })
    .filter((o) => o.share > 0.005)
    .sort((a, b) => b.share - a.share);
  const pointZone = cityZones.find((z) => booleanPointInPolygon(point, z as Feature<Polygon | MultiPolygon>));
  const primary = overlaps[0];
  return {
    id,
    name: f.properties!.AREA_NAME as string,
    representativePoint: point.geometry.coordinates.map((c) => Number(c.toFixed(6))),
    zoneCode: primary?.zoneCode ?? null,
    zoneShare: primary ? Number(primary.share.toFixed(3)) : 0,
    pointZoneCode: pointZone?.properties!.survey_zone_cde ?? null,
    straddles: overlaps.length > 1 && primary.share < 0.9,
    overlaps: overlaps.map((o) => ({ zoneCode: o.zoneCode, share: Number(o.share.toFixed(3)) })),
  };
});
const ids = new Set(neighbourhoods.map((n) => n.id));
if (neighbourhoods.length !== 158 || ids.size !== 158) throw new Error("Expected 158 unique neighbourhood IDs");

writeFileSync(
  `${OUT}/neighbourhoods.json`,
  JSON.stringify(
    {
      source: {
        boundaries: {
          publisher: "City of Toronto Open Data",
          title: "Neighbourhoods (158), WGS84",
          url: "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/fc443770-ef0a-4025-9c2c-2cb558bfab00/resource/0719053b-28b7-48ea-b863-068823a93aaa/download/neighbourhoods-4326.geojson",
          sha256: sha256(NB_FILE),
          licence: "Open Government Licence – Toronto",
        },
        zones: {
          publisher: "CMHC",
          title: "HMIP survey zones, FeatureServer/2 (current geography year 2026)",
          url: "https://geospatial.cmhc-schl.gc.ca/server/rest/services/CMHC_APPS/HMIP_CURRENT_CAWD/FeatureServer/2",
          sha256: sha256(ZONE_FILE),
        },
        assignmentMethod:
          "Each neighbourhood is assigned to the CMHC survey zone holding the largest share of its area (turf intersect, WGS84). " +
          "PROVISIONAL: zone polygons are the 2026 geography layer, while the 2025 rent tables use 2021 census zone definitions; " +
          "no official 2025 polygon layer was available. Rent benchmarks are zone means, never neighbourhood prices.",
      },
      neighbourhoods: neighbourhoods.sort((a, b) => a.id - b.id),
    },
    null,
    2,
  ),
);

const straddling = neighbourhoods.filter((n) => n.straddles);
const mismatch = neighbourhoods.filter((n) => n.pointZoneCode !== n.zoneCode);
console.log(`CMHC zones: ${zoneRows.length}; neighbourhoods: ${neighbourhoods.length}`);
console.log(`straddling (<90% in one zone): ${straddling.length}; rep-point zone != area zone: ${mismatch.length}`);
console.log(`unassigned: ${neighbourhoods.filter((n) => !n.zoneCode).length}`);
