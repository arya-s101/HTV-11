import type { Metadata } from "next";
import evidenceJson from "../../../data/game/evidence.json";
import { ELECTION_HUB, FARES, LEVERS } from "@/game/data";
import { CONTENT, CONTENT_DISCLAIMER } from "@/game/journey";

export const metadata: Metadata = { title: "Data & sources · ToRento" };

const ONTARIO_RIGHTS = { title: "Government of Ontario: Renting in Ontario: your rights", url: "https://www.ontario.ca/page/renting-ontario-your-rights" };

export default function Sources() {
  const real = [
    { title: "CMHC Rental Market Survey, Toronto, Table 1.1.9 (October 2025)", url: evidenceJson.sources.cmhc.url, use: "Average rent of vacant private apartments by survey zone and bedroom type. Zone averages, not live asking rents; suppressed values stay unknown.", licence: evidenceJson.sources.cmhc.licence },
    { title: "City of Toronto Neighbourhood Profiles, 2021 Census (158-model)", url: evidenceJson.sources.profiles.url, use: "Share of tenant households spending 30%+ on shelter; median rented shelter cost.", licence: evidenceJson.sources.profiles.licence },
    { title: "City of Toronto Neighbourhoods (158) + CMHC survey-zone polygons", url: "https://geospatial.cmhc-schl.gc.ca/server/rest/services/CMHC_APPS/HMIP_CURRENT_CAWD/FeatureServer/2", use: "Matching each neighbourhood to a CMHC zone (provisional: 2026 polygons, 2021 zone definitions).", licence: "Open Government Licence – Toronto; CMHC" },
  ];
  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">Data & sources</span>
        <h1>Where every number comes from</h1>
        <p className="lede">
          Real observations and fictional scenarios are kept in separate files and labelled on screen. All sources below were checked in October 2026.
        </p>
      </header>

      <section className="paper">
        <h2>Real Toronto data</h2>
        <ul className="source-list">
          {real.map((s) => (
            <li key={s.title}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
              <p>{s.use}</p>
              <span className="note">{s.licence}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="paper">
        <h2>Renting rules and tips taught in the game</h2>
        <p className="muted">{CONTENT_DISCLAIMER} Each item lists who checked it; items checked by the AI assistant still need a teammate to confirm.</p>
        <ul className="source-list">
          {CONTENT.map((c) => (
            <li key={c.id}>
              <p>{c.claim}</p>
              <span className="note">
                <a href={c.source_url} target="_blank" rel="noreferrer">
                  {c.source_title}
                </a>{" "}
                · {c.jurisdiction} · checked {c.retrieved} · {c.verified_by}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="paper">
        <h2>Fares</h2>
        <ul className="source-list">
          {FARES.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
              <p>{s.supports}</p>
              <span className="note">Checked {s.retrievedOn}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="paper">
        <h2>Civic levers</h2>
        <ul className="source-list">
          {LEVERS.filter((l) => l.sources.length).map((l) => (
            <li key={l.id}>
              <b>
                {l.name} <span className="note">({l.jurisdiction}{l.sourced ? "" : ", not yet sourced: stage disabled"})</span>
              </b>
              {l.sources.map((s) => (
                <p key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                  : {s.supports}
                </p>
              ))}
            </li>
          ))}
          <li>
            <b>Legal questions in negotiation</b>
            <p>
              <a href={ONTARIO_RIGHTS.url} target="_blank" rel="noreferrer">
                {ONTARIO_RIGHTS.title}
              </a>
              : linked, never paraphrased by the landlord.
            </p>
          </li>
          <li>
            <b>Election</b>
            <p>
              <a href={ELECTION_HUB.url} target="_blank" rel="noreferrer">
                {ELECTION_HUB.title}
              </a>
            </p>
          </li>
        </ul>
      </section>

      <section className="paper">
        <h2>What&apos;s fictional, and what AI does</h2>
        <ul>
          <li>People, incomes, offers, rents, utilities, commute minutes, landlords and job paths are illustrative.</li>
          <li>Gemini may write the landlord&apos;s lines and job paths for custom professions. Code validates both and decides every number.</li>
          <li>A preset profession sets its own illustrative income and commute days (handwritten, not AI). A custom profession is story only. Neither changes offers, evidence or score.</li>
        </ul>
      </section>
    </div>
  );
}
