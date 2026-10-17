# Sources

Every real number or civic claim in the game comes from one of these sources. Each one was fetched or checked
on the date shown. Fictional scenario values live only in `data/game/stages.json` and are labelled `illustrative` in the UI.

## Real observations (`data/game/evidence.json`, built by `npm run build:evidence`)

| Source | URL | Fields used | Retrieved | Caveat shown in game |
|---|---|---|---|---|
| City of Toronto Neighbourhood Profiles, 2021 Census, 158-model (XLSX, sheet `hd2021_census_profile`) | https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/6e19a90f-971c-46b3-852c-0c48c436d1fc/resource/19d4a806-7385-4889-acf2-256f1e079060/download/nbhd_2021_census_profile_full_158model.xlsx | Row 378: "% of tenant households spending 30% or more of its income on shelter costs"; Row 380: "Median monthly shelter costs for rented dwellings ($)". The column is matched by neighbourhood number (row 2) and name (row 1). | 2026-10-17 | 2021 Census, incomes refer to 2020; neighbourhood geography |
| CMHC Rental Market Survey, Toronto 2025, Table 1.1.9 | https://assets.cmhc-schl.gc.ca/sites/cmhc/professional/housing-markets-data-and-research/housing-data-tables/rental-market/rental-market-report-data-tables/2025/rmr-toronto-2025-en.xlsx?rev=f107330e-4620-4462-9027-8c6ff1522f1a | Average rent of **vacant** private-apartment units by survey zone and bedroom type, with quality grade. `**` (suppressed) is kept as unknown. | 2026-10-16 | Survey-zone average from October 2025; not a live asking rent; no room rents published |
| City of Toronto Neighbourhoods (158), WGS84 | https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/fc443770-ef0a-4025-9c2c-2cb558bfab00/resource/0719053b-28b7-48ea-b863-068823a93aaa/download/neighbourhoods-4326.geojson | Neighbourhood ID, name, boundary | 2026-10-16 | — |
| CMHC HMIP survey zones (FeatureServer/2, geography year 2026) | https://geospatial.cmhc-schl.gc.ca/server/rest/services/CMHC_APPS/HMIP_CURRENT_CAWD/FeatureServer/2 | Zone polygons used to assign each neighbourhood to a survey zone by largest area overlap | 2026-10-16 | **Provisional:** 2026 polygons vs. the 2021-census zone definitions used in the 2025 tables. All 5 game neighbourhoods are ≥99.7% inside one zone. |

## Fare rule (`data/game/levers.json` → `fares`)

| Source | URL | Used | Retrieved |
|---|---|---|---|
| TTC news: Back to school on the TTC (Sept 4, 2026) | https://www.ttc.ca/news/2026/September/Back-to-school-on-the-TTC | $3.30 adult PRESTO/debit/credit fare; $128.15 post-secondary monthly pass (needs a TTC Post-Secondary Student Photo ID); 47-paid-trip monthly cap with the same payment method | 2026-10-17 |
| TTC: Fares and passes | https://www.ttc.ca/Fares-and-passes | Free transfers within 2 hours; capping started August 31, 2026 | 2026-10-16 |
| TTC: Monthly fare capping | https://www.ttc.ca/riding-the-ttc/Updates/Monthly-fare-capping-coming-to-the-TTC | Reachable (HTTP 200) | 2026-10-17 |

## Civic levers (`data/game/levers.json`)

| Lever | Status | Source | What it supports |
|---|---|---|---|
| TTC service standards (municipal) | **Sourced** | https://www.toronto.ca/city-government/accountability-operations-customer-service/city-administration/city-managers-office/agencies-corporations/agencies/ (modified 2025-12-04) | The TTC is a City Service Agency that manages and operates subways, streetcars, buses and Wheel-Trans. Service agencies are governed by a Board with decision-making authority delegated by City Council. |
| | | https://www.toronto.ca/legdocs/mmis/2025/tts/bgrd/backgroundfile-258031.pdf ("Overview of TTC Service Standards", Strategic Planning Committee, Sept 4, 2025) | Board-approved service standards "are applied at every level of service planning". Example standards: weekday-peak local bus every 30 min or better; on-time departure from 1 min early to 5 min late. The review is due to report back in Q4 2026. |
| Ontario rent increase guideline (provincial) | **Sourced** | https://www.ontario.ca/page/residential-rent-increases (updated 2026-06-23) | 2026 guideline 2.1%; units first occupied after Nov 15, 2018 are exempt from rent control |
| Affordable rental delivery (Stage 4) | Partially sourced: stage disabled | https://www.toronto.ca/legdocs/mmis/2023/ex/bgrd/backgroundfile-234815.pdf | URL reachable; content not reviewed for municipal vs. provincial/federal split |
| Planning near transit, family-sized units, seniors' housing (Stages 3, 5, 6) | Not sourced: stages disabled | — | — |
| City election hub | — | https://www.toronto.ca/city-government/elections/ | Election day is Monday, October 26, 2026 |

| Landlord legal-question deflection (negotiation) | Linked only, never paraphrased by the landlord | https://www.ontario.ca/page/renting-ontario-your-rights (updated 2026-09-18) | Official Ontario page on tenant and landlord rights |

## LLM (negotiation voice only)

- Gemini API, `generateContent` with JSON output (`responseMimeType` + `responseSchema`). Default model `gemini-3.5-flash-lite`, which the
  [models page](https://ai.google.dev/gemini-api/docs/models) recommends for fast, cost-efficient text (checked 2026-10-17). Override it with `GEMINI_MODEL`.
- **Not tested live:** no API key was available in development. The call path is covered by unit tests with a mocked model, and the
  scripted fallback is what actually ran.

### Not usable

- `https://secure.toronto.ca/council/agenda-item.do?item=2025.TTS2.1` (cited in the PRD) returned **HTTP 403** to automated access on 2026-10-17, so it could not be verified. The TTC report above, from the same committee and year, is used instead.

## Cross-check, not shown in game

The fictional offers' neighbourhoods were picked so their illustrative commute times roughly match a scheduled-service
estimate: r5py on the TTC GTFS (see `data/snapshots/travel-times.json`) gives Black Creek → Union 60 min, West Queen West → Union 30 min,
Highland Creek → UTSC 16 min, Woburn North → UTSC 24 min, Dorset Park → UTSC 41 min. The game still labels commute
times **illustrative** because that router hasn't been validated by the team (PRD §10).
