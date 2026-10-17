# Toronto Rent Decisions (working title)

> **PRD v4 (overhaul.txt):** sound is on by default (music and effects channels; music ducks under effects; every button taps), no timers
> anywhere and a Skip button (or S) on every question, fresh questions each game (code picks reviewed templates, answers and distractors from
> `data/game/questions.json`; Gemini only rewrites the scene via `/api/scenarios`, validated, with reviewed fallbacks and none in the demo),
> an optional "Tell us more" profile kept on the device (workplace → real routed commute, schedule, income band as `player_input`, pets,
> newcomer, wants nearby, interests; identity fields never change numbers), and party-mode multiplayer behind `NEXT_PUBLIC_MULTIPLAYER`
> (Firebase anonymous auth + room codes; rules in `firestore.rules`; scores computed by the host client, a known hackathon limitation).
>
> **Game-show presentation (gameshow.txt, PRD v2 §5.10):** after character creation, the journey runs as "The Lease You Can Do", hosted by
> the original 8-bit cartoon host Mustafa. Each phase is a round with a title card. Lines type in one at a time (tap finishes, then advances), there are at most
> 3 lines of 15 words per screen, and details sit behind "Why? · Source". Big choice buttons, animated number counters with provenance chips, a podium with
> score, receipts and three lifelines (Ask Mustafa, Magnifier, Free Pass), and reveals with a drumroll, chime/buzzer, shake and confetti. Settings: text speed, skip
> animations and sound (off by default); prefers-reduced-motion is respected. Music in the navbar is also muted by default. Code: `src/components/show/`.
>
> **PRD v2 (slightpivot.txt): "a flight simulator for your first Toronto apartment."** Stage 2 (First job) is now an 8-phase journey:
> Search (spot the scam) → Viewing (compare offers, then a timed hunt in a pixel apartment) → Apply → Negotiate (optional) → Read the lease →
> Move in (photos become receipts, insurance, first-month numbers) → Live there (seeded events: who to contact, which level) → Move out →
> report card + civic question. Teaching content lives in `data/game/content.json`, each item with an official source, retrieval date and
> verifier. Journey data is in `data/game/journey.json` and the logic in `src/game/journey.ts` (seeded; the demo uses seed 2026). Student and later stages are roadmap.

> Working title. Don't use "RentShield" (rentshield.ca exists). The product spec is `../prd.md` (PRD).

An 8-bit life sim for the 2026 Toronto municipal election (Monday, October 26). You create a pixel character and play
through life stages. At each stage you make a rental choice, see its consequences, and get the Toronto evidence. Then comes
the civic turn: you sort what you can verify yourself from what the City (or another government) controls. Each stage ends with a sourced,
nonpartisan question for municipal candidates. The end screen collects your questions, shows a reasoning tracker, and lets you copy one question.

**Tier 1 is built:** character creator (6 layers, age picker, demo preset), Stage 1 Student, Stage 2 First job, and the end screen.
Stages 3–6 show "coming soon" because their civic levers don't have an official source yet (PRD §5).

**Difficulty (Easy / Normal / Hard)** changes how information is shown, never what is true. Easy shows plain line items. Normal hides
costs in listing text. Hard uses lease-style fine print, route legs instead of minutes, and a raw CMHC table the player reads. The reasoning
score multiplies by 1 / 1.25 / 1.5 and never depends on the home chosen.

**Starting profession:** choose a preset (handwritten job path) or type your own. Gemini writes a fresh, story-only path via `/api/career`
(Extended game only; the Base game makes no API calls). A preset shows its handwritten path instantly and keeps it as the fallback; custom titles
fall back to a template; any number or money talk is rejected. Each preset also sets its own illustrative income and commute days per stage
(`work` in `professions.json`; software keeps the hero values). Custom professions use the stage defaults. Offers and score never change.
The demo preset keeps a fixed path so the judged demo is repeatable.

**Site structure:** shared navbar and footer, a neon-grid background, and pages `/` (game), `/how-it-works` and `/sources`
(rendered from the same data files the game uses).

**Background music:** drop a file named `theme.mp3` (or `.ogg`, `.m4a`, `.wav`) into `public/music/`; see the README there.
It loops quietly and starts on the first click (browsers block autoplay), and a ♪ toggle appears in the navbar. Use only music you have the rights to share.

**Optional landlord negotiation:** code decides the deal (`src/game/negotiate.ts`). Gemini only writes the landlord's words and is
validated against code's decision; it runs server-side in `/api/negotiate`. Without `GEMINI_API_KEY`, and always for the demo preset,
a scripted landlord is used. Copy `.env.example` to `.env.local` to enable Gemini (optional).
Starting at age 26 or older therefore can't be played yet, and the creator explains why.

## Run it (Node 20+; no Java, Python or API keys needed; Gemini key optional)

```bash
cd rent-app
npm install
npm run dev          # http://localhost:3000
```

Checks (all verified passing 2026-10-17). Don't run plain `npm run build` while `npm run dev` is running: both write to `.next/`, and the dev page breaks (404s on JS/CSS).

```bash
npm test             # vitest unit tests: 75 pass
npm run typecheck    # tsc --noEmit
npm run lint
npm run build:check  # production build into .next-check/; safe while `npm run dev` is running
npm run build:evidence  # rebuild data/game/evidence.json from raw downloads (maintainers)
```

## How it works

| Path | What |
|---|---|
| `data/game/stages.json` | **Fictional** personas, offers, rents, utilities, commutes, reveals and civic cards (all `illustrative`) |
| `data/game/evidence.json` | **Real** observations per neighbourhood (CMHC zone rent, 2021 Census tenant burden and median shelter cost), each a `Field` with unit, geography, reference period, source URL, status and source cell. Generated by `scripts/build-game-evidence.ts`; never edit it by hand. |
| `data/game/levers.json` | Civic levers with jurisdiction and official sources; fare rule; election hub. A stage only ships if its lever is `sourced`. |
| `data/SOURCES.md` | Every URL, the fields used and the retrieval date |
| `src/game/calc.ts` | Pure maths: monthly income, burden, fare with the 47-trip cap and post-secondary pass, commute hours. Integer cents; time is never converted to money. |
| `src/game/outcome.ts` | Consequence numbers, each with a status. Takes the character as input, and tests prove appearance changes nothing. |
| `src/game/civic.ts` | Sorting feedback with jurisdiction explanations and source links |
| `src/game/question.ts` | Deterministic draft question from your choice, the lever and the evidence. No AI. |
| `src/game/sprite.ts` | Original 16×24 layered pixel sprite |
| `src/game/life.ts` | Starting age → stage; ages at later stages |
| `src/game/score.ts` | Reasoning score; difficulty multiplier |
| `src/game/negotiate.ts` | Deterministic negotiation engine, scripted landlord lines, validation of LLM output |
| `data/game/negotiation.json`, `src/server/negotiation.ts`, `src/app/api/negotiate/route.ts` | **Server-only** hidden landlord configs, the Gemini call (key never sent to the browser), and the API route that replays the player's messages |
| `data/game/professions.json`, `src/game/career.ts`, `src/server/career.ts`, `src/app/api/career/route.ts` | Preset job paths, validation, and the custom-profession Gemini call |
| `src/server/gemini.ts` | Shared server-only Gemini client (8 s timeout, JSON output) |
| `src/components/SiteChrome.tsx` | Navbar, footer, neon background |
| `src/components/`, `src/app/page.tsx`, `src/app/how-it-works`, `src/app/sources` | UI; the only server code is the two API routes |

Older pipeline (kept for provenance): `scripts/import-sources.ts` builds `data/snapshots/` (CMHC zones and rents, neighbourhood→zone
assignment), and `scripts/routing/precompute_travel_times.py` (r5py) builds `travel-times.json`. Those times are only a cross-check;
the game labels commutes illustrative.

### Refreshing source data (optional, maintainers only)

Raw downloads go in `data/raw/` (gitignored):

```bash
mkdir -p data/raw && cd data/raw
curl -L -o neighbourhoods.geojson "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/fc443770-ef0a-4025-9c2c-2cb558bfab00/resource/0719053b-28b7-48ea-b863-068823a93aaa/download/neighbourhoods-4326.geojson"
curl -L -o cmhc-toronto-2025.xlsx "https://assets.cmhc-schl.gc.ca/sites/cmhc/professional/housing-markets-data-and-research/housing-data-tables/rental-market/rental-market-report-data-tables/2025/rmr-toronto-2025-en.xlsx?rev=f107330e-4620-4462-9027-8c6ff1522f1a"
curl -L -o zones-all.geojson "https://geospatial.cmhc-schl.gc.ca/server/rest/services/CMHC_APPS/HMIP_CURRENT_CAWD/FeatureServer/2/query?where=metropolitan_major_area_cde%3D%272270%27&outFields=*&outSR=4326&f=geojson"
mv zones-all.geojson cmhc-toronto-zones.geojson
curl -L -o ttc-gtfs.zip "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/7795b45e-e65a-4465-81fc-c36b9dfff169/resource/cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/opendata_ttc_schedules.zip"
curl -L -o nbhd-profiles-2021.xlsx "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/6e19a90f-971c-46b3-852c-0c48c436d1fc/resource/19d4a806-7385-4889-acf2-256f1e079060/download/nbhd_2021_census_profile_full_158model.xlsx"
cd ../.. && npm run import:sources && npm run build:evidence
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
