# Rentin' ToRentino

Play it at **[rentintorentino.casa](https://www.rentintorentino.casa)**.

**Rentin' ToRentino** is a short browser game about renting a first apartment in Toronto. Players move through a first-lease journey: spot a fake listing, compare places, apply, haggle, read the lease, move in, handle something that breaks, and move out.

The listings are illustrative, not available units. The numbers behind them come from City of Toronto, CMHC, and Census data. Players see the cash and commute tradeoff, including costs that were easy to miss, and sort each problem by who controls it: themselves, the landlord, the City, or another government. The game ends with one sourced, nonpartisan question they can ask a ward candidate.

Gemini writes the fictional landlord's lines and story text for a custom job title. Game code decides every number and checks the model's wording. ElevenLabs speaks the host, Dominic ToRento. Without an ElevenLabs key, the browser voice is used.

The app lives in [`rent-app/`](rent-app/). Setup, the file map, and source notes are in [`rent-app/README.md`](rent-app/README.md).

## Run it locally

Node 20+. No API keys are required.

```bash
cd rent-app
npm install
npm run dev
```

Open http://localhost:3000. Copy `rent-app/.env.example` to `rent-app/.env.local` to enable Gemini and ElevenLabs. Both are optional.
