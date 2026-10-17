import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import Link from "next/link";
import { Legend } from "@/components/pixel";
import { STAGES } from "@/game/data";
import { RULES } from "@/game/negotiate";
import { DIFFICULTY_INFO, DIFFICULTY_MULTIPLIER } from "@/game/score";
import type { Difficulty } from "@/game/types";

export const metadata: Metadata = { title: "How it works · Toronto Rent Decisions" };

const LOOP = [
  ["Search", "Flag listings as legit, suspicious or a scam. Rent far below the CMHC area average is a red flag."],
  ["Viewing", "Compare the offers, then answer quick viewing questions: water damage, smoke alarms, locks, pests, what's included."],
  ["Apply", "Bring the right documents, refuse the risky asks, and decide what to do when someone outbids you."],
  ["Negotiate", "Optional. Haggle with a fictional landlord; game code decides the deal."],
  ["Read the lease", "Flag clauses that Ontario's rules make void, like no-pet bans or damage deposits."],
  ["Move in", "Photograph existing damage, decide on contents insurance, and see your first month's numbers."],
  ["Live there", "Handle problems: who do you contact, and which level of government can act?"],
  ["Move out", "Give proper notice. Your move-in photos settle the final walkthrough."],
  ["Report card", "A skill-only readiness score, your receipts, and a sourced question for candidates."],
];

export default function HowItWorks() {
  const levels: Difficulty[] = ["easy", "normal", "hard"];
  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">How it works</span>
        <h1>A flight simulator for your first Toronto apartment</h1>
        <p className="lede">
          Practise the whole renting process where mistakes are cheap: spot the scam, find what the landlord didn&apos;t mention, take the photos that
          save you later, and learn who to call. Then see which problems your next city council can actually change.
        </p>
      </header>

      <section className="paper">
        <h2>The journey (First job stage)</h2>
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
            <li>
              Build a strong case (a valid data point, a cheaper comparable place, being a reliable tenant, flexibility, a longer lease, being ready to sign)
              and the landlord gives extra leeway: down to {levels.map((d) => `${Math.round(RULES[d].strongFloorPct * 100)}%`).join(" / ")} under asking.
            </li>
            <li>Evidence works only when it&apos;s true: if the rent is already under the CMHC area average, the landlord says so.</li>
            <li>The landlord never gives legal advice. Ask about rules and you&apos;ll get the official Ontario page.</li>
            <li>No key, a timeout or the demo preset? A scripted landlord answers instead.</li>
          </ul>
        </div>
        <div className="paper">
          <h2>Scoring</h2>
          <ul>
            <li>Scams caught, viewing issues found, lease problems spotted</li>
            <li>Right documents brought, move-in photos taken</li>
            <li>Best response to each problem, and the right level of government</li>
            <li>Knowing where to report a scam, and moving out with proper notice</li>
          </ul>
          <p className="note">Never scored: which home you picked, its price, its commute, your income, your job, or whether you bought insurance. Replays use a new seed so you can&apos;t just memorize answers.</p>
        </div>
      </section>

      <section className="panel">
        <Legend />
      </section>

      <div className="row">
        <Link className="btn" href="/">
          <Icon name="play" /> Play
        </Link>
        <Link className="btn ghost" href="/sources">
          See the sources
        </Link>
      </div>
    </div>
  );
}
