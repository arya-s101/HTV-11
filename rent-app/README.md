# Toronto Rent Hunt (working name)

A game. Each round gives you a renter (income, workplace, bedrooms needed, commute limit, priority) and six **fictional**
listings. Pick the best one. If you're right, the game breaks down why it wins. If you're wrong, it explains why your
pick loses and why the correct listing is correct. Points: 100 for the best pick, +20 for each correct answer in a row
before it, 40 for a valid but not best pick, 0 for a pick that breaks a rule. A game is 5 rounds.

**Rules** (`src/lib/game/engine.ts`): a listing is valid if rent + utilities ≤ 30% of gross monthly income, the TTC commute is
within the limit, and it has at least the bedrooms needed. The best listing is the valid one with the lowest rent + utilities
(or the shortest commute when the renter's priority is time). TTC fares are identical for every listing, so they never decide a round.

**What's real:** listing rents are drawn within -18%/+15% of the CMHC October 2025 vacant-unit mean for that neighbourhood's
survey zone. Commute minutes are real scheduled TTC times from that neighbourhood (see below). Names, streets and listings are made up and
labelled as such.

**How rounds work** (`src/lib/game/generate.ts`): rounds are deterministic from `(seed, round)`. The generator keeps sampling until
a round has one clear winner (≥$40 or ≥4 min ahead), at least two different kinds of rule-breaking, and a "lure" that
looks better at first glance. The server re-derives the answer, so the browser never sees it before you pick.
`GET /api/game/round?seed=&round=` returns the round, and `POST /api/game/answer {seed, round, listingId, streak}` returns
the judgement.

The original area screener is still available at `/explore` (`POST /api/recommend`).

## Run it (Node 20+; no Java, Python or API keys needed)

```bash
cd rent-app
npm install
npm run dev          # http://localhost:3000
```

Checks (all verified passing 2026-10-17). Don't run plain `npm run build` while `npm run dev` is running: both write to `.next/`, and the dev page breaks (404s on JS/CSS).

```bash
npm test             # vitest unit tests: 28 pass
npm run typecheck    # tsc --noEmit
npm run lint
npm run build:check  # production build into .next-check/; safe while `npm run dev` is running
npm run scenario     # prints real-data scenarios (no-match, cap change, limit change)
```

## How it works

- `data/snapshots/*.json`: normalized source snapshots, committed. The app reads only these.
- `src/lib/calc.ts`: pure money and time functions (integer cents, income basis, burden, TTC fare cap, gaps).
- `src/lib/recommend.ts`: validates input and screens all 158 neighbourhoods. Each one is classified as feasible, misses-housing, misses-commute, misses-both, or unknown. Unknown can never pass.
- `src/lib/explain.ts`: a deterministic plain-language summary built only from computed numbers. It is also the future fallback if Gemini fails.
- `POST /api/recommend` takes the input and returns the result. `GET /api/recommend` lists the destinations and the departure window.

### Data and what each number means

| Snapshot | Source | Caveat |
|---|---|---|
| `cmhc-rents-2025.json` | CMHC Rental Market Survey, Toronto 2025, Table 1.1.9. Vacant and occupied private-apartment mean rents by zone and bedroom count, October 2025. Each value keeps its quality grade and source cell. | These are survey-zone means, not neighbourhood prices or current listings. `**` (suppressed) is kept as `null`, never zero. Rents may include some utilities, depending on the lease. |
| `neighbourhoods.json` | City of Toronto Neighbourhoods (158), assigned to a CMHC survey zone by largest area overlap. | **Provisional:** the zone polygons are CMHC's 2026 geography layer, but the 2025 tables use 2021 census zone definitions. 153/158 neighbourhoods are ≥90% inside one zone. The other 5 straddle zones and are flagged in the UI. |
| `travel-times.json` | r5py 1.1.7 (Conveyal R5) on the TTC GTFS (feed valid 2026-09-30 to 10-31) plus the OpenStreetMap walk network. Trips leave from each neighbourhood's representative point to 5 preset destinations. Departures are every minute from Wed 2026-10-21 07:30 for 60 min; the snapshot stores p25, p50 and p75. | Scheduled service only: no delays or disruptions. One origin point per neighbourhood. Only the preset destinations are supported. |
| TTC fares (`calc.ts`) | ttc.ca/Fares-and-passes, checked 2026-10-16: $3.30 adult PRESTO or contactless, free transfers within 2 hours, 47-fare monthly cap. | Assumes one payment method. Every area gets the same fare, so a shorter trip saves time, not dollars. |

### Refreshing source data (optional, maintainers only)

Raw downloads go in `data/raw/` (gitignored):

```bash
mkdir -p data/raw && cd data/raw
curl -L -o neighbourhoods.geojson "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/fc443770-ef0a-4025-9c2c-2cb558bfab00/resource/0719053b-28b7-48ea-b863-068823a93aaa/download/neighbourhoods-4326.geojson"
curl -L -o cmhc-toronto-2025.xlsx "https://assets.cmhc-schl.gc.ca/sites/cmhc/professional/housing-markets-data-and-research/housing-data-tables/rental-market/rental-market-report-data-tables/2025/rmr-toronto-2025-en.xlsx?rev=f107330e-4620-4462-9027-8c6ff1522f1a"
curl -L -o zones-all.geojson "https://geospatial.cmhc-schl.gc.ca/server/rest/services/CMHC_APPS/HMIP_CURRENT_CAWD/FeatureServer/2/query?where=metropolitan_major_area_cde%3D%272270%27&outFields=*&outSR=4326&f=geojson"
mv zones-all.geojson cmhc-toronto-zones.geojson
curl -L -o ttc-gtfs.zip "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/7795b45e-e65a-4465-81fc-c36b9dfff169/resource/cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/opendata_ttc_schedules.zip"
cd ../.. && npm run import:sources
```

To recompute travel times (one machine only), you need Java 21 (`brew install openjdk@21`), Python 3.12 with `r5py`, and an
OSM extract (`https://download.bbbike.org/osm/bbbike/Toronto/Toronto.osm.pbf`):

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
python scripts/routing/precompute_travel_times.py data/raw/ttc-gtfs.zip Toronto.osm.pbf data/snapshots/neighbourhoods.json data/snapshots/travel-times.json
```

The GTFS feed only covers service through 2026-10-31. Before that date, refresh the feed and move the departure date in the script.

## Attribution and licences

- Contains information licensed under the [Open Government Licence – Toronto](https://open.toronto.ca/open-data-license/).
- Adapted from Canada Mortgage and Housing Corporation (CMHC) Rental Market Survey data. This product has not been reviewed or endorsed by CMHC. (Check the CMHC data reuse licence wording before public release.)
- Walking network © OpenStreetMap contributors, ODbL.
- AI use: see `docs/BUILD_LOG.md`.
