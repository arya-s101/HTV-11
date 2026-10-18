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

## Pivot 2: PRD "Rentin' ToRentino" (newmessage.txt, 2026-10-17 ~00:45 Toronto)

Replaced the listing-pick game with the PRD's 8-bit life sim, Tier 1 only. The old game, `/explore` and the API routes were removed
because the old game scored picking the cheapest listing, which breaks PRD §5. They remain in git history (`first commit`).

- Sources re-verified 2026-10-17 (details in `data/SOURCES.md`). One PRD source, council agenda item 2025.TTS2.1, returns HTTP 403 to
  automated access and could not be verified. The TTC report "Overview of TTC Service Standards" (Sept 4, 2025, toronto.ca) is used instead.
- New finding: TTC sells a $128.15 post-secondary monthly pass, so the Student stage compares it with pay-per-trip (the pass loses at 32 trips).
- Commute minutes stay **illustrative** as the PRD requires. Offer neighbourhoods were chosen so the r5py scheduled times roughly match them.
- Tests: 19 pass. They cover every §8 calculation, appearance invariance, age→stage mapping, lever gating, evidence labelling,
  CMHC suppression, jurisdiction feedback, and the question varying with the choice and staying neutral.
- Browser: the demo preset plays character → 2 stages → copy question in about 8 s of automated clicks, with no console errors and no phone overflow.
- A pixel body font made digits ambiguous ($4,583.33 read as $4,333.33). Body text and numbers now use IBM Plex Mono; the pixel font is for headings only.

### §8 acceptance status
- [x] Character creator: 6 layers, age picker, demo preset · [x] age → stage · [x] appearance changes no numbers (test)
- [x] Demo preset: creation → 2 stages → exit question, well under 4 min · [x] notebook, pick and copy
- [x] Reasoning tracker per stage · [x] "Illustrative scenario, not an available listing" on every offer
- [x] Calc tests ($4,583.33; 34.9%/38.2%; 20 h; $132 both; 47 cap) · [x] status badge on every number, linked to its source where it has one
- [x] Unknown revealed after the choice · [x] ≥2 labelled Toronto facts with geography and reference period
- [x] Jurisdiction feedback with source links · [x] question varies with the choice, names a lever and a measurable outcome, links the election hub
- [x] No endorsement, prediction or "first/only" (test) · [x] copy to clipboard (with a fallback for http origins)
- [ ] PRD §3 kill test and 2-person paper prototype: these are for the team, not code

## PRD update: difficulty + LLM landlord negotiation (difficultyupdate.txt, 2026-10-17)

- **Difficulty** (Easy default/demo, Normal, Hard): it's chosen in the creator and can be changed between stages. Each offer has `presentation.listingText`
  (Normal) and `finePrint` + `routeLegs` (Hard); tests prove every hidden fact is recoverable (legs sum to the commute, text contains
  the rent and the utilities cue, and the raw CMHC table contains the exact benchmark). `consequence()` takes no difficulty input. Badges stay at every level.
  Hard adds two decoding tasks (sum the route legs, read the raw CMHC table). The consequence shows what you caught and what you missed.
- **Reasoning score:** flags (as a share) 40 + lever 30 + other statements 30, plus Hard decoding up to 20, × 1 / 1.25 / 1.5. It never reads price, commute or neighbourhood.
- **Negotiation:** this is optional. Code decides rent and concessions through hidden per-offer configs plus difficulty rules (floor −8/−5/−2%,
  step sizes, turn limits, concession limits). The server replays the player's messages, so client state is never trusted. Gemini's output is
  validated: its rent and concessions are ignored in favour of code's, and any message quoting another dollar figure or touching legal
  rules is replaced by the scripted line. Legal questions get a deflection plus the official Ontario link. Abusive input ends the chat.
  The scripted landlord is used without a key, on timeout or error (8 s), and always for the demo preset.
- **Evidence as leverage, honestly:** both hero offers are already below their zone's CMHC average (A $1,600 vs $1,863; B $1,750 vs $2,025),
  so citing CMHC gets rebutted with the real number. I added Offer C (Leaside-Bennington condo, $2,100 vs Zone 9's $1,968, 42 min), where the
  argument genuinely works. The tradeoff rule for questions was updated for three offers.
- Tests: 40 pass (21 new). The browser run covered the demo with negotiation ($2,100 → $2,000 + hydro included) and the Hard run (decode + table + 1.5× score),
  with no console errors and no phone overflow. A grep of the client bundle found no negotiation config or API key.
- **Not verified:** a live Gemini call (no key available here). Default model id taken from Google's models page on 2026-10-17.
- Found and fixed: a message whose CMHC argument was rebutted was also treated as generic haggling and won a discount.

## Sprites, profession, UI structure (2026-10-17)

- Sprite fixes (checked on a rendered sheet of every layer): glasses were a solid black visor (frame and eye were the same colour on one row) and are now
  tinted lenses with a bridge and arms. The dress no longer shows pants pixels beside the legs: overlays gained a `_` clear token. The cap brim
  is shorter and the cap hides big hair above it.
- Starting profession: 7 handwritten presets, plus custom text sent to Gemini (`/api/career`) and validated so every stage is present, the text is short,
  and there are no digits, money or salary words, URLs or blocked terms. Without a key or on failure, a template is used. Story only: tests prove a
  profession changes no number. The First-job destination is now "work near Union Station", neutral across jobs.
- UI: shared layout with a sticky navbar (Play, How it works, Data & sources, election pill), a three-column footer (about, data licences,
  vote links, AI-use note) and a skip link. Retro neon grid background (striped sun, glowing horizon, scrolling perspective grid; still under
  reduced motion). New pages `/how-it-works` and `/sources` are generated from the data files. Home has a hero, a 5-step strip and feature cards. The
  creator is grouped (Who you are / Look / Game) with a sticky preview. In-game there's a HUD bar (avatar, age, job, stage, difficulty, Quit) and the timeline shows job titles.
- Tests: 46 pass. Browser: Easy demo with negotiation, Hard run, home/creator/stage/pages at desktop and phone, no console errors, no overflow.

## Gemini for every profession + first live checks (2026-10-17)

- Preset buttons now call `/api/career` with `{presetId}`. The handwritten path shows at once and Gemini's fresh path replaces it when it
  arrives; a request counter makes sure only the latest click can update the character. Bad output, failures and no key keep the handwritten path.
- **Live Gemini verified** for the first time, with the user's key in `.env.local`. The file was never opened; the source was confirmed from API responses.
  Two Teaching runs produced different paths. "bus driver" became "Transit Operator". The negotiation used Gemini wording, and the injected "$1" was
  ignored: rent stayed at code's $2,025.
- Tests: 49 pass.

## Friendlier landlord (2026-10-17)

- Rewrote the Gemini system prompt: the landlord is a kind, casual person texting. It reacts to what you said first, says no gently with a human reason,
  varies its openings, and writes 2 to 4 sentences. The decision, number and legal guardrails are unchanged. Personas were rewritten to be warmer.
  Northgate's landlord is now "Sam at Northgate Property Management". Temperature is 0.9.
- Found and fixed a validation gap during live testing: Gemini wrote prices in words ("sixteen hundred"), which slipped past the `$`-only check.
  The validator now refuses spelled-out amounts (hundred/thousand or number-word pairs) and checks bare numbers of 100+ that aren't years; the prompt requires `$1,600`-style digits.
- The scripted fallback and demo voice were rewritten in the same friendly tone, including the legal-question deflection.
- Tests: 50 pass. Live check: 6 Gemini replies across 4 scenarios, all warm, varied and on code's numbers.

## Rent leeway for a strong case (2026-10-17)

- New code-decided "case strength". Each kind of argument counts once: valid CMHC point 2, cheaper comparable offer in the same stage 2 (only if one exists),
  reliable tenant (job, references, pays on time) 1, ready to sign 1, flexible move-in 1, longer lease 1. Reaching 3 / 4 / 5 on Easy / Normal / Hard
  triggers a one-time goodwill cut ($75 / $75 / $50) and deepens the floor from 8/5/2% to 12/8/5% under asking. Weak haggling never passes the normal floor.
- The chat shows a case meter and new quick replies (a cheaper comparable place, stable job and references, ready to sign). How it works explains the rule.
- Live (Hard, Offer B $1,750): a weak ask stayed at $1,750; a strong two-message case reached 5/5, giving $1,700 plus free laundry, all on code's numbers.
- Tests: 53 pass.

## Background music slot (2026-10-17)

- `public/music/` holds `theme.mp3|ogg|m4a|wav` (README inside). `MusicToggle` in the navbar HEAD-checks for the file, loops it at 30%,
  starts on the first click or keypress (autoplay policy), and remembers on/off in localStorage. It's hidden when no file exists.
- Verified with a temporary test tone (since deleted): it plays after a click, toggles, and the "off" choice survives a reload. With no file the button is hidden.

## PRD v2 pivot: the rental journey (slightpivot.txt, 2026-10-17)

- Stage 2 is now the full 8-phase journey, built to Tiers 1, 1b and 1c. Student is now on the roadmap (its journey content isn't sourced), and the default age is 23.
- **Sources first:** 28 ContentItems, each opened and confirmed on an official page before use. Sources: Competition Bureau (scams, report to the Canadian Anti-Fraud Centre),
  CMHC (viewing checks, move-in inspection), OHRC (what landlords can ask), the Ontario standard lease guide (void terms, deposits, insurance), LTB guides
  (24-hour entry notice, rent deposit, repairs, 60-day N9), Ontario rent increases, and City of Toronto pages (21°C heat Oct 1 to May 15, RentSafeTO requests in
  writing then 311, smoke alarms). Correction: Toronto's heat window is now Oct 1 to May 15, not Sept 15 to June 1. Every item reads
  `verified_by: "AI (Claude); needs teammate check"`, because the PRD asks for teammate initials.
- Mechanics: seeded RNG per phase; viewing issues you miss come back as Live-there events. Move-in photos decide the move-out dispute. The insurance choice
  changes an event's outcome but not the score. The report card is skill only. The civic notebook builds questions from the City-level problems you hit
  (TTC reliability, heat, repairs); the City lever "RentSafeTO and the indoor temperature bylaw" was added.
- Tests: 68 pass. Browser: the demo plays all 8 phases to the report card in about 25 s of automated clicks, with no errors and no phone overflow.
- Background music: the user added public/music/theme.mp3, and the navbar toggle detects it.

## Game-show presentation (gameshow.txt, PRD v2 §5.10), 2026-10-17

- New show shell in `src/components/show/`:
  - **Text:** line player (typewriter; tap finishes, then advances; auto-advances after a pause).
  - **Show pieces:** host "Dominic ToRento" (an original, generic cartoon presenter in 8-bit pixel art, plus his own name and script), round title cards with a pixel-dissolve entrance, a podium bar (score with fly-up points, receipts, lifelines, settings, quit), and a round strip.
  - **Numbers and answers:** animated counters with provenance chips that open their sources, a "Why? · Source" drawer, big 2–4 choice buttons, and reveals (drumroll → ✓/✗ with words, not just colour → host quip → lesson lines). Confetti on the report card.
  - **Settings:** text speed (slow/normal/fast/instant), skip animations, and sound effects (Web Audio; off by default). Reduced motion turns off movement, shake and confetti. The demo runs at "fast".
- Every phase is now a round: Spot the Fake (timed, one listing at a time, 4 per run), The Viewing (verify picks → three "doors" → timed hunt),
  Paperwork (one document at a time + rival), Haggle Time (optional), Read the Fine Print (no timer; Hard stays tiny until Magnifier), Moving Day (photos,
  insurance, first-month counters, surprise, real data), Life Happens (action → who fixes it, 4 levels), Moving Out, and the report card + candidate question.
- Lifelines: Ask Dominic (hint: shows the % vs average, flashes an unfound issue, or hides a wrong answer), Magnifier (decodes Hard fine print), Free Pass (skip; excluded from totals).
  Each unused lifeline earns a bonus.
- Text rules are enforced by tests: every content `short`, host line, event, feedback, outcome, reveal line and question ask is ≤15 words, ≤3 lines.
  Hard fine print is the deliberate exception. Round titles were renamed to avoid real TV show names ("Let's Make a Deal" was caught); a test bans known show names and catchphrases.
- Music in the navbar is now muted by default (PRD).
- Bug found in browser testing: an effect returned `false` from the sound helper (React error). Fixed.
- Tests: 75 pass. Browser: the full demo finishes in about 100 s of automated play at "fast" (about 90 s with reduced motion), a perfect run scores 100%, there are no console errors, and there's no phone overflow.

## 2026-10-17: PRD v4 overhaul (overhaul.txt)

- **No timers, Skip everywhere:** removed the Spot the Fake countdown and all timer code; the Free Pass lifeline is gone. Every graded question has Skip (button or S), which shows the answer in one line, scores zero, earns no receipt, still shows the stat card, and counts separately on the report card (correct / wrong / skipped).
- **Sound on by default:** `src/components/audio.ts` unlocks on the first tap; music 0.25 and effects 0.8, music ducks to 40% under effects and restores over 300 ms; mute and both sliders persist. Effects: correct, wrong, skip, round start, reveal, stat card, report fanfare, button tap (all game buttons), player joined.
- **Fresh questions:** reviewed templates in `data/game/questions.json` (≥2 correct variants, ≥4 distractors, ≥3 fallback scenarios each; drafted by Claude from sourced content, team to verify). Code samples the answer, distractors and order per seed and prefers templates unseen in the last 3 games. Gemini (server-side `/api/scenarios`) writes only scene text with placeholders; anything with digits, unknown placeholders, missing features, legal-claim wording or profanity is rejected (one retry), and the reviewed fallback is used. Pre-fetched in the background while the player builds their character. Demo preset: fallbacks only.
- **Profile:** Quick start (name, look, age, career) plus "Tell us more" (`src/components/ProfileForm.tsx`), saved on the device with a Clear button. Workplace uses the r5py travel-time snapshot (derived), schedule changes trip counts, an income band is a `player_input` field. Pets add the no-pets clause; newcomers get the no-credit-history question. Identity fields never change numbers (tested). An optional Extended event shows a landlord asking an unfair question (OHRC-sourced, random, labelled not legal advice).
- **Multiplayer (feature flag):** `src/multiplayer/` + `src/components/Multiplayer.tsx` + `firestore.rules`. Not yet run against a live Firebase project or the rules emulator (needs a project and Java). Known limitations: host client computes scores; no scheduled cleanup function (rooms are treated as expired after 2 hours); room size is checked client-side.

## 2026-10-17: Read aloud (PRD v5, TTS.txt) and the Rentin' ToRentino name

- Site renamed **Rentin' ToRentino**; host renamed **Dominic ToRento** ("Ask Dominic" lifeline).
- `src/narrator/`: `Narrator` interface, `WebSpeechNarrator` (browser speechSynthesis; the only code that touches it), `NullNarrator` (unsupported/no English voice), `pronounce.ts` (TTC, CMHC, LTB, 311, money, percent, A/C, "+ hydro"; strips emoji), settings store.
- Question screens (listings, viewing checks, documents, lease clauses, move-in, events, level of government, scam report, move-out) read their lines, then "A: …, B: …" options with an outline highlight. Typewriter lines start with their utterance; the next waits for the voice, with a safety timeout (length × 90 ms + 1.5 s). Answering, Skip, tapping past, Settings, leaving the screen and hiding the tab all cancel speech. Replay button and R re-read.
- Settings: Read aloud (default on), Read options, voice (en-CA → en-US → en-GB → any English, local voices first), speed (0.85/1.05/1.25), Test voice; a Read aloud toggle on the welcome screen. Music ducks to ~30% while speaking; master mute silences the voice; speech is unlocked on the first tap.
- Multiplayer uses the same game, so each client reads aloud with its own settings.
- Not yet checked by hand across Chrome, Edge, Firefox, Safari and iOS Safari.

## 2026-10-17: ElevenLabs host voice; the host reads everything

- `ElevenLabsNarrator` (implements `Narrator`) plays clips from `/api/tts` (server-only `src/server/tts.ts`: key in `ELEVENLABS_API_KEY`, voice `ELEVENLABS_VOICE_ID`, model eleven_flash_v2_5, in-memory clip cache, per-IP rate limit). All lines of a screen are fetched in parallel; clips are cached client-side too. No key, quota or network → the browser voice (`WebSpeechNarrator`), then silence.
- Dominic now reads everything he says: every host bubble (welcome, round intros with "Round N: title", scenes, questions, outros), reveal verdicts with his reaction and feedback, application verdicts, the civic question, plus options and listing ads.
