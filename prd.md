# PRD — Toronto Rent Decisions

> Working title. Don't use "RentShield" (rentshield.ca exists).

Hack the Valley 11, [2026 School of Cities challenge](https://hack-the-valley-11.devpost.com/): civic tech for a real Toronto problem tied to the **October 26, 2026 municipal election**, grounded in Toronto urban data.

Code comments cite this file as `PRD §N`; keep section numbers stable.

---

## 1. Summary

A short browser game in an 8-bit style. The player creates a character, then plays one or two Toronto rental decisions (Student, First job). Each decision walks through: choose a fictional home → optionally haggle with the landlord → see the real monthly consequence and the unknown they missed → read real Toronto evidence for that neighbourhood → sort statements into "I can verify this" / "the City controls this" / "another government controls this" → get a neutral, sourced question for municipal candidates. The end screen collects the questions and lets the player copy one.

**Pitch:** pick a Toronto rental, see the budget and commute tradeoffs you missed, learn which part of the problem city council can actually change, and leave with one evidence-backed question to ask candidates.

## 2. User and goals

**User:** a Toronto renter or prospective renter who wants the civic context of a housing decision before the election.

**Goals**
- Decision literacy: spot unknown costs; keep cash and time separate.
- Civic literacy: attribute a constraint to the right level of government.
- A candidate question that depends on the player's own choice and cited evidence.

**Non-goals.** The app must not show real listings or promise a home, give legal advice, endorse candidates or tell people how to vote, predict a policy's impact, or claim to be first/only or to change outcomes.

## 3. Positioning

Rent/commute calculators ([RentShield.ca](https://rentshield.ca/)), cost-of-living games ([Make Rent](https://farisfarooq.com/make-rent), [The Right Moves](https://apps.urban.org/features/right-moves/)) and election issue dashboards ([TTCriders](https://www.ttcriders.ca/2026election)) already exist. Our distinct step is the **civic turn**: going from the player's own tradeoff to the correct municipal lever and a sourced, candidate-neutral question. The character, difficulty and negotiation are wrappers around that; they must not replace it.

## 4. What the game does

### 4.1 Screens

`title` → `create` → (`stage` → `between`) × playable stages → `end`. Pages: `/` (game), `/how-it-works`, `/sources` (rendered from the same data files).

- **Title:** New game, or **Demo preset** (fixed character, age 20, Easy, scripted landlord; reproducible for judging).
- **Create:** name, starting age (16–100), 6 sprite layers (skin, hair style, hair colour, outfit, outfit colour, accessory) with randomize, starting profession, difficulty. Shows which stages will be played. Start is disabled if the age maps to an unplayable stage (26+).
- **Stage:** 7 steps (§4.4). A timeline shows all six life stages; unplayable ones are marked "coming soon". Any stage can be skipped.
- **Between:** the character ages; reasoning tracker table; difficulty can be changed.
- **End:** homes chosen, reasoning trend, notebook of questions; pick one and copy it; link to the [City election hub](https://www.toronto.ca/city-government/elections/).

### 4.2 Life stages

| # | Stage | Ages | Status |
|---|---|---|---|
| 1 | Student — room/shared unit, commute to UTSC; $1,600/mo net income; post-secondary pass available | 16–21 | **Playable**, 3 offers |
| 2 | First job — 1-bedroom, commute to Union; $55,000/yr gross | 22–25 | **Playable**, 3 offers |
| 3 | New job | 26–29 | Placeholder (`enabled: false`) |
| 4 | Moving in with a partner | 30–32 | Placeholder |
| 5 | Kids | 33–64 | Placeholder |
| 6 | Retirement | 65+ | Placeholder |

A stage is playable only if it is enabled, has offers and civic cards, **and** its lever in `levers.json` is `sourced` (`isPlayable` in `src/game/data.ts`). Both playable stages use the **TTC service** lever. Stages 3–6 need an officially sourced lever plus offers, civic cards and negotiation configs before they can ship.

### 4.3 Character and profession

- Appearance is **cosmetic only**; it never changes a number (tested).
- Each **preset profession** sets its own illustrative income (with gross/net basis) and commute days per playable stage (`work` in `professions.json`). Software keeps the hero values (§4.7) and is the demo preset. Income and trips flow into burden, fare and commute hours. Offers, evidence, civic cards and score stay identical for everyone.
- Profession: 7 presets (nursing, software, trades, teaching, hospitality, arts, retail), each with a job title per stage. A custom profession goes to `/api/career`: Gemini writes story text per stage. The output is validated (no numbers or money talk; blocked words), and a template is used on failure or when there is no key.

### 4.4 Stage flow

1. **Start:** character, age, job title, the stage's household, income (with gross/net basis), destination.
2. **Choose:** 3 fictional offers, each labelled "Illustrative scenario, not an available listing". Before choosing, the player flags what they'd verify (utilities, commute at real times, rent control, extra fees). How offers are shown depends on difficulty (§4.5).
3. **Negotiate (optional):** §4.6.
4. **Consequence:** monthly housing cash, rent burden against the stated income basis, TTC fare (cheapest of pay-as-you-go with the 47-trip cap, or the post-secondary pass where eligible), commute hours/month. The offer's hidden unknown is revealed, e.g. "hydro extra" turns out to be $95/mo. Time is never converted to money.
5. **Evidence:** real figures for the offer's neighbourhood. CMHC survey-zone rent for that bedroom type (Oct 2025), and from the 2021 Census the share of tenants spending 30%+ on shelter and median shelter cost. Each shows geography, reference period and source.
6. **Civic turn:** sort 3 statements into personal / municipal / non-municipal (for example, ride the route at 8 a.m. / TTC on-time departures / rent control). Wrong answers get a jurisdiction explanation and a source link.
7. **Question:** a deterministic draft question built from the player's tradeoff (long commute / paid for time / middle), the lever's service standard (frequency or reliability), and the neighbourhood's census figure. Saved to the notebook along with the reasoning score.

### 4.5 Difficulty

Changes **presentation only, never facts**. Every hidden fact can be recovered from the screen.

| Level | Offers shown as | Score × |
|---|---|---|
| Easy | Plain line items; unknowns flagged; commute in minutes | 1 |
| Normal | Listing text ("hydro extra"); the player must spot and flag unknowns | 1.25 |
| Hard | Lease-style fine print; commute as route legs to add up; a raw CMHC table to read for the benchmark | 1.5 |

Reasoning score (`src/game/score.ts`): unknowns flagged (40), lever attributed correctly (30), other statements sorted (30), plus on Hard a commute-decoded bonus (10) and a CMHC-table-read bonus (10). It never reads price, commute, neighbourhood or income.

### 4.6 Landlord negotiation

- **Code decides the deal** (`src/game/negotiate.ts`). The floor rent comes from asking rent and difficulty. Concessions and persuasive arguments (citing the CMHC benchmark, flexible move-in, longer stay) are in `data/game/negotiation.json`, which is server-only.
- `/api/negotiate` replays the transcript through the engine. Gemini only phrases the decided reply. Its output is validated, and the scripted line is used if it adds numbers, legal talk or unapproved concessions.
- Scripted landlord when there is no `GEMINI_API_KEY`, on error or timeout (8 s), and always in the demo preset.
- The landlord deflects legal questions (Ontario tenancy law is provincial). The player can accept or walk away. The negotiated rent is labelled "illustrative — negotiated".

### 4.7 Hero demo — Stage 2 (illustrative values)

| | Offer A | Offer B |
|---|---|---|
| Rent | $1,600 (hydro extra, revealed $95) | $1,750 (utilities included) |
| One-way commute | 60 min | 30 min |
| Rent burden on $4,583.33/mo gross | 34.9% | 38.2% |
| TTC (40 trips × $3.30) | $132 | $132 |

B costs $150 more and saves 20 h/month, with **no fare savings**. Either preference is reasonable; neither is scored.

## 5. Hard rules

- Fictional offers/personas (`stages.json`) stay separate from real observations (`evidence.json`).
- Every displayed number is a `Field` with a status (`measured` / `derived` / `illustrative` / `unknown`) and a source.
- All figures are computed in code, in integer cents. LLMs never produce costs, figures or geography joins.
- Monthly income = annual / 12; gross vs. net is labelled. Missing or zero income gives an unavailable ratio.
- No invented fare savings from a shorter trip; bus legs are not separate fares.
- Never imply a councillor can personally change a route or lower market rent, or that the City sets rents.
- CMHC survey-zone averages are not live asking rents; suppressed cells stay null.
- No scraping or unlicensed listing feeds.
- Appearance and difficulty never change a number, offer or score. A profession changes only income and commute days, and only from handwritten preset data; custom (LLM/template) professions use the stage defaults.
- A stage ships only when its civic lever has an official source.
- LLM output is always validated; the LLM never gives legal advice; API keys and negotiation configs stay server-side.

## 6. Data

```ts
type Field<T> = {
  value: T | null;          // null when status === "unknown"
  unit: string;
  geography: string;        // "Fictional scenario", "CMHC zone X", "Neighbourhood #N (158 model)"
  reference_period: string;
  source_url: string | null;
  status: "measured" | "derived" | "illustrative" | "unknown";
};
```

| File | Content |
|---|---|
| `data/game/stages.json` | Fictional stages, offers (rent, utilities, commute, unknowns, reveal, listing text / fine print / route legs), civic cards, verify items |
| `data/game/evidence.json` | Real per-neighbourhood evidence + CMHC table. Generated by `npm run build:evidence`; don't hand-edit |
| `data/game/levers.json` | Civic levers with jurisdiction, `sourced` flag and official sources; TTC fare rule (Sept 2026); election hub |
| `data/game/negotiation.json` | Server-only landlord configs |
| `data/game/professions.json` | Preset job paths |
| `data/SOURCES.md` | Every URL, fields used, retrieval date |

Real sources: City of Toronto 158 neighbourhoods and 2021 Neighbourhood Profiles; CMHC Rental Market Survey Toronto (Oct 2025) and survey-zone layer; TTC fare pages. Commute minutes are illustrative (r5py travel times in `data/snapshots/` are only a cross-check).

## 7. Technical shape

Next.js 15 + TypeScript in `rent-app/`, Vitest, no database. Pure logic is in `src/game/` (calc, outcome, civic, question, score, life, sprite, negotiate, career). Server-only code is in `src/server/` (Gemini client, negotiation, career) behind `src/app/api/negotiate` and `src/app/api/career`. UI: `src/app/page.tsx` (screens), `src/components/StageView.tsx` (stage steps), `Negotiation.tsx`, `pixel.tsx`, `SiteChrome.tsx`.

## 8. Acceptance criteria

Built (Tier 1): character creator, Stages 1–2, end screen, difficulty, negotiation, profession. Must keep passing:

- [ ] Demo preset plays creation → two stages → exit question in about 4 minutes, with no narration needed.
- [ ] Calc tests: $4,583.33/mo; 34.9% / 38.2%; 20 h; $132 for both offers; 47-trip cap; post-secondary pass.
- [ ] Appearance/profession change no numbers; difficulty changes no facts.
- [ ] Every number shows status + source; every offer shows the illustrative label.
- [ ] At least one unknown revealed and two labelled Toronto facts per stage.
- [ ] Exit question varies with the player's choice and links the election hub; copy works.
- [ ] Negotiation output is clamped by code; the scripted fallback works without a key.
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run build:check` pass.

Next (Tier 2): Stages 3–6, each only after its lever is officially sourced.

## 9. Learning outcomes (only these may be claimed)

Across stages: unknown charges identified; public lever attributed correctly; the question names a lever and a measurable outcome.

## 10. Open items

- Official sources for the Stage 3–6 levers (planning near transit, affordable-rental delivery, family-sized units, seniors' housing), plus their offers, civic cards and negotiation configs.
- Starting ages 26+ are currently unplayable.
- Commute times remain illustrative until a validated router is wired in.
- Final name/domain; Devpost submission, public repo, AI-use disclosure, 4-min demo.
