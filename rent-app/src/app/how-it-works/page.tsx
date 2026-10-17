import type { Metadata } from "next";
import Link from "next/link";
import { Legend } from "@/components/pixel";
import { STAGES } from "@/game/data";
import { RULES } from "@/game/negotiate";
import { DIFFICULTY_INFO, DIFFICULTY_MULTIPLIER } from "@/game/score";
import type { Difficulty } from "@/game/types";

export const metadata: Metadata = { title: "How it works · Toronto Rent Decisions" };

const LOOP = [
  ["Start", "Your character, age, job and an illustrative income, household and destination."],
  ["Choose", "Two or three fictional offers. Mark what you'd verify before signing."],
  ["Negotiate", "Optional. Haggle with a fictional landlord; game code decides the deal."],
  ["Consequence", "Housing cash, rent burden, TTC fare and commute time, shown separately. One unknown is revealed."],
  ["Evidence", "Real Toronto data for that neighbourhood, each figure with its place, date and source."],
  ["Civic turn", "Sort what you verify yourself from what the City, or another government, controls."],
  ["Question", "A neutral question for candidates, built from your choice, saved to your civic notebook."],
];

export default function HowItWorks() {
  const levels: Difficulty[] = ["easy", "normal", "hard"];
  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">How it works</span>
        <h1>One rental decision per life stage</h1>
        <p className="lede">
          Each stage runs the same loop. Across stages you collect questions and see whether your reasoning improves. You leave with one sourced question
          to ask a municipal candidate before October 26, 2026.
        </p>
      </header>

      <section className="paper">
        <h2>The loop</h2>
        <ol className="loop">
          {LOOP.map(([t, d], i) => (
            <li key={t}>
              <span className="num">{i + 1}</span>
              <div>
                <b>{t}</b>
                <p>{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="paper">
        <h2>Life stages</h2>
        <p>A stage only becomes playable once its civic lever is backed by an official source.</p>
        <table className="table">
          <tbody>
            {STAGES.map((s) => (
              <tr key={s.id}>
                <td>
                  <b>{s.title}</b> <span className="note">age {s.defaultAge}</span>
                </td>
                <td>{s.housingNeed}</td>
                <td className="v">{s.enabled ? <span className="yes">Playable</span> : <span className="muted">Coming soon</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="paper">
        <h2>Difficulty</h2>
        <p>Difficulty changes how information is shown, never what is true. Every hidden fact can be worked out from the screen.</p>
        <table className="table">
          <tbody>
            {levels.map((d) => (
              <tr key={d}>
                <td>
                  <b>{DIFFICULTY_INFO[d].label}</b>
                </td>
                <td>{DIFFICULTY_INFO[d].blurb}</td>
                <td className="v">×{DIFFICULTY_MULTIPLIER[d]} score</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="two-col">
        <div className="paper">
          <h2>Negotiating</h2>
          <ul>
            <li>The landlord is fictional. Gemini may write their words; game code alone sets the price and any extras.</li>
            <li>
              Floors sit {levels.map((d) => `${Math.round(RULES[d].floorPct * 100)}%`).join(" / ")} under asking on Easy / Normal / Hard.
            </li>
            <li>Evidence works only when it&apos;s true: if the rent is already under the CMHC area average, the landlord says so.</li>
            <li>The landlord never gives legal advice. Ask about rules and you&apos;ll get the official Ontario page.</li>
            <li>No key, a timeout or the demo preset? A scripted landlord answers instead.</li>
          </ul>
        </div>
        <div className="paper">
          <h2>Scoring</h2>
          <ul>
            <li>Unknowns you flagged before choosing (as a share): 40</li>
            <li>City lever attributed correctly: 30</li>
            <li>Other statements sorted correctly: 30</li>
            <li>Hard only: route legs decoded and CMHC table read: up to 20</li>
          </ul>
          <p className="note">Never scored: which home you picked, its price, its commute, your income or your job.</p>
        </div>
      </section>

      <section className="panel">
        <Legend />
      </section>

      <div className="row">
        <Link className="btn" href="/">
          ▶ Play
        </Link>
        <Link className="btn ghost" href="/sources">
          See the sources
        </Link>
      </div>
    </div>
  );
}
