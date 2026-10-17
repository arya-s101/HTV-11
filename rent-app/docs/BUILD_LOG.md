# Build log: first slice (2026-10-16, started 23:25 America/Toronto, after the 22:00 coding start)

The handoff's `outputs/` docs (TASKS, DECISIONS, AI_USE_DISCLOSURE and the rest) and `work/data-validation/` live on another
machine and were **not available here**. All sources were re-downloaded from the official URLs in the handoff. File sizes match:
CMHC xlsx is 269,587 bytes and the GTFS zip is 36,417,654 bytes. Merge the sections below into those docs.

## Tasks status

- [x] Import a verified set of area candidates: 158 neighbourhoods, each with a CMHC zone benchmark (value, quality, source cell) and a representative origin point.
- [x] Prove one scheduled commute with an existing engine. r5py 1.1.7 (R5), Java 21: Kennedy Stn area → Union, departing 08:00–09:00 Wed 2026-10-21, median 48 min. **Automated routing gate passed**, about 5 min after the install finished.
- [x] Precompute all 158 neighbourhoods × 5 destinations (p25/p50/p75). None were unreachable within 150 min.
- [x] Pure affordability, fare and gap functions; `POST /api/recommend`; minimal frontend.
- [x] Verify numbers and run scenarios: no-match, cap change and limit change (see below).
- [x] Tests: suppressed rent, latest RentSafeTO evaluation, normalized IDs, income basis and zero income, TTC transfer and cap, no feasible option, route failure.
- [x] Build, typecheck, lint and browser smoke test (headless Chrome: 3 scenarios, phone width, no console errors).
- [ ] Gemini explanation (sanitized structured input, timeout, falls back to `explain.ts`)
- [ ] Arbitrary destinations: these need on-demand routing. Only 5 presets are computed today.
- [ ] RentSafeTO building layer in the UI (helper and test only so far)
- [ ] Tiger Data history (CMHC 2024/2025, Table 1.1.2), Vultr, GoDaddy domain, final name
- [ ] Refresh GTFS before 2026-10-31, when the feed's service calendar ends

## Real-data scenario results (`npm run scenario`)

Inputs: $55,000/yr gross, 1-bedroom, 20 commute days per month, TTC.

| Scenario | Feasible of 158 | Notes |
|---|---|---|
| $1,800 cap, 45 min to Union | 2 | Yorkdale-Glen Park (41 min) and Englemount-Lawrence (45 min). Both are in Zone 15, $1,782, quality **c** |
| $1,900 cap, 45 min to Union | 7 | Adds Zone 17 ($1,863) and Zone 2 Danforth areas ($1,874, 34–35 min) |
| $1,800 cap, 60 min to Union | 5 | All Zone 15 |
| $1,800 cap, 45 min to UTSC | **0** | Closest by rent: Highland Creek, 16 min, needs +$100/mo. Closest by commute: Bedford Park-Nortown, $1,782, needs +36 min |
| $1,900 cap, 45 min to UTSC | 9 | Zone 12 Scarborough East |

TTC is $132/month (40 fares) for every area, so no fare-dollar savings are claimed.

**Strategic caution for Alp:** at $1,800 every feasible area depends on one zone's benchmark (Zone 15, quality "c", $18 under
the cap). The boundary is real and it moves visibly, but it is coarse: rents come from 17 zone values, and many
neighbourhoods share one number. The commute varies by neighbourhood; the rent does not. Present it as a zone-level rent
screen with neighbourhood-level commute, not as neighbourhood rent precision.

## Decisions

- Rent uses the **vacant-unit** mean (CMHC 1.1.9) because it fits someone searching now better than occupied rent. The occupied value is kept in the snapshot.
- Neighbourhood → zone assignment is by largest area overlap with the 2026 CMHC polygons, labelled provisional. The 2025 tables use 2021 census zones, and no 2025 polygon layer was available. The handoff noted the historical-service query for 2025 returned nothing.
- Routing is precomputed offline (Python/Java), and the web app reads JSON, so teammates need only `npm install`.
- Departure window is Wed 2026-10-21 07:30–08:30 (regular weekday service, no service removals in calendar_dates). Arrive-by is not modelled.
- Near matches are listed in two separate groups, "commute fits / rent too high" (sorted by $) and "rent fits / commute too long" (sorted by min). Dollars and minutes are never combined into one score.
- Every area gets the same fare model: $3.30 × one-way trips, capped at 47 fares. Each one-way trip counts as one fare because of the 2-hour transfer.
- Unknown utilities are not added and are labelled "excl. utilities". Shelter burden is reported only when the user enters utilities.
- SheetJS `xlsx@0.18.5` (npm) has known advisories. It is a dev-only dependency used to parse the official CMHC file at import time and is never shipped.

## AI use disclosure

Claude Code (Claude Opus 5.5, Anthropic) did the following: re-downloaded and inspected sources; wrote the importer, the routing
precompute script, the calculation and recommendation code, the tests, the UI and this log; and ran the scenarios and smoke tests. No AI
model generates or alters any number shown to users. All values come from the cited sources and deterministic code.

## Pivot: game (2026-10-17, ~00:00 Toronto)

The team clarified the product: it is a **game**, not a screener. The player gets a scenario and fictional listings and must pick
the optimal one. Points, a streak bonus, and explanations for both right and wrong picks are built
(`src/lib/game/`, `src/app/page.tsx`). The screener moved to `/explore`.

This intentionally departs from the handoff's "no imaginary listings" rule. That rule was about passing fictional units off as
real ones. Here every listing is labelled "Fictional listing", and the footer explains which numbers are real.

- Tests: 28 pass, including generator determinism, 500 generated rounds that each have a unique optimum, the hidden answer, and scoring.
- A test caught a float bug: the 30% budget for $80k came out as $1,999.99. Fixed with integer math.
- Browser smoke test: a full 5-round game, the final summary, phone width, `/explore`, and no console errors.
