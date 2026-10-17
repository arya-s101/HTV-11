// Typed access to the normalized source snapshots in data/snapshots/ (built by scripts/).
import cmhcJson from "../../data/snapshots/cmhc-rents-2025.json";
import nbJson from "../../data/snapshots/neighbourhoods.json";
import ttJson from "../../data/snapshots/travel-times.json";

export const BEDROOMS = ["studio", "1br", "2br", "3br+"] as const;
export type Bedroom = (typeof BEDROOMS)[number];

export interface Measure {
  valueCents: number | null;
  quality: string | null;
  suppressed: boolean;
  cell: string;
}

export interface CmhcZone {
  zoneCode: string;
  zoneLabel: string;
  zoneName: string;
  inCityOfToronto: boolean;
  benchmarks: Record<Bedroom, { vacant: Measure; occupied: Measure }>;
}

export interface Neighbourhood {
  id: number;
  name: string;
  representativePoint: number[];
  zoneCode: string | null;
  zoneShare: number;
  straddles: boolean;
  overlaps: { zoneCode: string; share: number }[];
}

export interface Destination {
  id: string;
  name: string;
  lonlat: number[];
}

export interface SourceData {
  cmhc: { source: typeof cmhcJson.source; zones: CmhcZone[] };
  neighbourhoods: { source: typeof nbJson.source; neighbourhoods: Neighbourhood[] };
  travel: {
    source: typeof ttJson.source;
    destinations: Destination[];
    /** destinationId -> neighbourhoodId -> [p25, p50, p75] minutes, or null if unreachable */
    minutes: Record<string, Record<string, number[] | null>>;
  };
}

export const sources: SourceData = {
  cmhc: cmhcJson as SourceData["cmhc"],
  neighbourhoods: nbJson as SourceData["neighbourhoods"],
  travel: ttJson as SourceData["travel"],
};
