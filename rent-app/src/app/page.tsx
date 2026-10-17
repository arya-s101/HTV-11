"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Failure, Listing, PickResult, POINTS, Scenario } from "@/lib/game/engine";
import { BuildingArt, HeroArt, Icon } from "./art";

interface PublicRound {
  seed: string;
  round: number;
  totalRounds: number;
  points: typeof POINTS;
  scenario: Scenario;
  listings: Listing[];
}

const BEST_KEY = "rentgame.best";
const ROUNDS = 5;
const BEDROOMS: Record<string, string> = { studio: "Studio", "1br": "1 bed", "2br": "2 bed", "3br+": "3+ bed" };
const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-CA")}`;

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeBest(n: number) {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    // storage unavailable (private mode etc.): best score just isn't remembered
  }
}

/** crypto.randomUUID only exists on secure origins; plain-http LAN URLs need a fallback. */
function newSeed(): string {
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes.forEach((_, i) => (bytes[i] = Math.floor(Math.random() * 256)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function maxScore(p: typeof POINTS, rounds: number) {
  let total = 0;
  for (let i = 0; i < rounds; i++) total += p.optimal + p.streakBonus * i;
  return total;
}

function rankFor(score: number, max: number) {
  const r = score / max;
  if (r >= 0.85) return "Lease Legend";
  if (r >= 0.55) return "Savvy Renter";
  if (r >= 0.25) return "Apartment Apprentice";
  return "Rental Rookie";
}

const outcome = (r: PickResult) => (r.correct ? "best" : r.valid ? "valid" : "invalid");

export default function Game() {
  const [seed, setSeed] = useState<string | null>(null);
  const [roundNo, setRoundNo] = useState(1);
  const [round, setRound] = useState<PublicRound | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<PickResult | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [history, setHistory] = useState<PickResult[]>([]);
  const [best, setBest] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [points, setPoints] = useState<typeof POINTS | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => setBest(readBest()), []);

  const loadRound = useCallback(async (s: string, n: number) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/game/round?seed=${s}&round=${n}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load round");
      setRound(data);
      setPoints(data.points);
      setSelected(null);
      setResult(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load round");
    } finally {
      setBusy(false);
    }
  }, []);

  function start() {
    const s = newSeed();
    setSeed(s);
    setRoundNo(1);
    setScore(0);
    setStreak(0);
    setHistory([]);
    setFinished(false);
    loadRound(s, 1);
  }

  async function lockIn() {
    if (!seed || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/game/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seed, round: roundNo, listingId: selected, streak }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not check answer");
      setResult(data);
      setScore((s) => s + data.points);
      setStreak(data.newStreak);
      setHistory((h) => [...h, data]);
      requestAnimationFrame(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check answer");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!seed) return;
    if (roundNo >= ROUNDS) {
      if (score > best) {
        setBest(score);
        writeBest(score);
      }
      setFinished(true);
      setRound(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setRoundNo(roundNo + 1);
    loadRound(seed, roundNo + 1);
  }

  const playing = seed !== null && !finished;
  const selectedListing = round?.listings.find((l) => l.id === selected);

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" onClick={() => setSeed(null)}>
            <span className="brand-mark">
              <Icon name="home" size={20} />
            </span>
            <span className="brand-text">Rent Hunt</span>
          </Link>
          {playing && (
            <div className="hud">
              <div className="progress" aria-label={`Round ${roundNo} of ${ROUNDS}`}>
                {Array.from({ length: ROUNDS }).map((_, i) => (
                  <span key={i} className={history[i] ? outcome(history[i]) : i === roundNo - 1 ? "current" : ""} />
                ))}
              </div>
              <span className="pill round">
                <span className="label">Round</span> {roundNo}/{ROUNDS}
              </span>
              <span className="pill" key={`score-${score}`}>
                <span className="label">Score</span> <span className="bump">{score}</span>
              </span>
              <span className={`pill streak ${streak > 0 ? "hot" : ""}`}>
                <Icon name="flame" size={16} /> {streak}
              </span>
            </div>
          )}
        </div>
      </div>

      <main>
        {!seed && <Intro best={best} onStart={start} />}
        {error && (
          <p className="error">
            {error}{" "}
            <button className="btn secondary" onClick={() => (seed ? loadRound(seed, roundNo) : start())}>
              Try again
            </button>
          </p>
        )}

        {playing && round && (
          <>
            <RenterCard s={round.scenario} roundNo={roundNo} />
            <div className="section-head">
              <h2>Which listing should {round.scenario.personName} take?</h2>
              <span className="muted small">{result ? "Answers revealed" : "Tap a listing, then lock it in"}</span>
            </div>
            <div className="listings">
              {round.listings.map((l) => (
                <ListingCard
                  key={l.id}
                  l={l}
                  s={round.scenario}
                  selected={selected === l.id}
                  verdict={result?.breakdown.find((b) => b.listingId === l.id)}
                  yours={result?.pickedId === l.id}
                  disabled={!!result || busy}
                  onSelect={() => setSelected(l.id)}
                />
              ))}
            </div>
            {result && <ResultPanel r={result} onNext={next} last={roundNo >= ROUNDS} />}
          </>
        )}

        {finished && points && <Final score={score} best={Math.max(best, score)} max={maxScore(points, ROUNDS)} history={history} onRestart={start} />}

        <footer className="site">
          Listings, names and streets are fictional. Rents are drawn near CMHC&apos;s October 2025 average rent for each
          neighbourhood&apos;s rental survey zone. Commute times are real scheduled TTC trips (weekday morning, from the TTC
          timetable). <Link href="/explore">Explore the real area data →</Link>
        </footer>
      </main>

      {playing && round && !result && (
        <div className="lockbar">
          <div className="lockbar-inner">
            <span className="sel">{selectedListing ? `Selected: ${selectedListing.title}` : <span className="muted">No listing selected</span>}</span>
            <button className="btn" disabled={!selected || busy} onClick={lockIn}>
              {busy ? "Checking…" : "Lock it in"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Intro({ best, onStart }: { best: number; onStart: () => void }) {
  return (
    <>
      <section className="hero">
        <div>
          <h1>
            Can you find the <em>best apartment</em> in Toronto?
          </h1>
          <p className="lede">
            Each round, a renter needs a place. Six listings, one right answer. Real rents, real TTC commutes, and a few traps.
          </p>
          <button className="btn big" onClick={onStart}>
            Start game
          </button>
          {best > 0 && (
            <p className="muted small">
              <Icon name="trophy" size={14} /> Your best: {best}
            </p>
          )}
        </div>
        <div className="hero-art">
          <HeroArt />
        </div>
      </section>

      <section className="rules">
        <div className="rule">
          <div className="rule-icon">
            <Icon name="wallet" size={22} />
          </div>
          <h3>Fits the budget</h3>
          <p>Rent plus utilities can&apos;t exceed 30% of the renter&apos;s gross income. Watch out for utilities that aren&apos;t included.</p>
        </div>
        <div className="rule">
          <div className="rule-icon">
            <Icon name="train" size={22} />
          </div>
          <h3>Commute in time</h3>
          <p>The transit trip to work has to be within their limit. A cheap place two hours away doesn&apos;t count.</p>
        </div>
        <div className="rule">
          <div className="rule-icon">
            <Icon name="bed" size={22} />
          </div>
          <h3>Enough bedrooms</h3>
          <p>At least as many bedrooms as they need. Of the listings that pass, pick the cheapest, or the fastest if time matters most.</p>
        </div>
      </section>

      <div className="scoring">
        <span className="score-chip best">
          <Icon name="star" size={16} /> Best pick +100
        </span>
        <span className="score-chip streak">
          <Icon name="flame" size={16} /> +20 per streak
        </span>
        <span className="score-chip valid">Valid, not best +40</span>
        <span className="score-chip invalid">Breaks a rule +0</span>
      </div>
    </>
  );
}

function RenterCard({ s, roundNo }: { s: Scenario; roundNo: number }) {
  const hue = (s.personName.charCodeAt(0) * 37) % 360;
  return (
    <section className="renter reveal" key={`${roundNo}-${s.personName}`}>
      <div className="avatar" style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 75% 45%))` }}>
        {s.personName[0]}
      </div>
      <div>
        <div className="eyebrow">
          Round {roundNo} of {ROUNDS} · Your renter
        </div>
        <h2>{s.personName}</h2>
        <p className="story">
          Earns {money(s.annualGrossIncomeCents)} a year (before tax), works at {s.workName}, and commutes {s.commuteDaysPerMonth} days a month by TTC.
        </p>
        <div className="constraints">
          <div className="constraint">
            <Icon name="wallet" size={20} />
            <div>
              <div className="k">Max rent + utilities</div>
              <div className="v">{money(s.housingBudgetCents)}/mo</div>
            </div>
          </div>
          <div className="constraint">
            <Icon name="train" size={20} />
            <div>
              <div className="k">Max commute</div>
              <div className="v">{s.commuteLimitMinutes} min</div>
            </div>
          </div>
          <div className="constraint">
            <Icon name="bed" size={20} />
            <div>
              <div className="k">Needs at least</div>
              <div className="v">{BEDROOMS[s.bedroomsNeeded]}</div>
            </div>
          </div>
          <div className="constraint priority">
            <Icon name={s.priority === "money" ? "wallet" : "clock"} size={20} />
            <div>
              <div className="k">Cares most about</div>
              <div className="v">{s.priority === "money" ? "Lowest cost" : "Shortest commute"}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface Verdict {
  valid: boolean;
  optimal: boolean;
  failures: Failure[];
}

function ListingCard(props: {
  l: Listing;
  s: Scenario;
  selected: boolean;
  verdict?: Verdict;
  yours: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { l, s, selected, verdict, yours, disabled, onSelect } = props;
  const total = l.rentCents + l.utilitiesCents;
  const state = verdict ? (verdict.optimal ? "is-best" : verdict.valid ? "is-valid" : "is-invalid") : "";
  const fails = new Set(verdict?.failures ?? []);
  return (
    <button className={`listing ${selected ? "selected" : ""} ${state}`} disabled={disabled} onClick={onSelect} aria-pressed={selected}>
      <span className="photo">
        <BuildingArt seed={`${l.neighbourhoodId}-${l.title}`} hue={(l.neighbourhoodId * 47) % 360} />
        <span className="fict">Fictional listing</span>
        {verdict ? (
          <span className={`ribbon ${verdict.optimal ? "best" : verdict.valid ? "valid" : "invalid"}`}>
            {verdict.optimal ? "★ Best" : verdict.valid ? "Valid" : "Breaks rules"}
          </span>
        ) : (
          <span className="check">
            <Icon name="check" size={16} />
          </span>
        )}
        {yours && <span className="ribbon yours">Your pick</span>}
      </span>
      <span className="listing-body">
        <span className="price">
          {money(l.rentCents)}
          <small> /mo</small>
        </span>
        <span className={`utils ${l.utilitiesIncluded ? "inc" : "extra"}`}>
          {l.utilitiesIncluded ? "Utilities included" : `+ ${money(l.utilitiesCents)}/mo utilities`}
        </span>
        <span className="listing-title">{l.title}</span>
        <span className="where">
          <Icon name="pin" size={14} /> {l.neighbourhoodName}
        </span>
        <span className="meta">
          <span>
            <Icon name="bed" size={14} /> {BEDROOMS[l.bedrooms]}
          </span>
          <span>
            <Icon name="train" size={14} /> {l.commuteMinutes} min
          </span>
        </span>
        {verdict && (
          <ul className="checks reveal">
            <li className={fails.has("budget") ? "bad" : "ok"}>
              <Icon name={fails.has("budget") ? "x" : "check"} size={14} /> {money(total)} total vs {money(s.housingBudgetCents)} budget
            </li>
            <li className={fails.has("commute") ? "bad" : "ok"}>
              <Icon name={fails.has("commute") ? "x" : "check"} size={14} /> {l.commuteMinutes} min vs {s.commuteLimitMinutes} min limit
            </li>
            <li className={fails.has("bedrooms") ? "bad" : "ok"}>
              <Icon name={fails.has("bedrooms") ? "x" : "check"} size={14} /> {BEDROOMS[l.bedrooms]}, needs {BEDROOMS[s.bedroomsNeeded].toLowerCase()}
            </li>
          </ul>
        )}
      </span>
    </button>
  );
}

function ResultPanel({ r, onNext, last }: { r: PickResult; onNext: () => void; last: boolean }) {
  const tone = r.correct ? "win" : r.valid ? "close" : "lose";
  const kicker = r.correct ? "Nailed it" : r.valid ? "So close" : "Not quite";
  return (
    <section id="result" className={`result ${tone} reveal`}>
      <div className="result-banner">
        <div>
          <div className="kicker">{kicker}</div>
          <h2>{r.headline}</h2>
        </div>
        <div className="gain">
          +{r.points}
          {r.streakBonus > 0 && <small>incl. +{r.streakBonus} streak</small>}
        </div>
      </div>
      <div className={`result-body ${r.whyPickWrong.length ? "" : "single"}`}>
        {r.whyPickWrong.length > 0 && (
          <div>
            <h3>Why your pick loses</h3>
            <ul>
              {r.whyPickWrong.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h3>{r.correct ? "Why it's the best" : "Why the best listing wins"}</h3>
          <ul>
            {r.whyOptimal.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="result-foot">
        <span className="muted small">{r.notes.join(" ")}</span>
        <button className="btn" onClick={onNext}>
          {last ? "See final score" : "Next round →"}
        </button>
      </div>
    </section>
  );
}

function Final(props: { score: number; best: number; max: number; history: PickResult[]; onRestart: () => void }) {
  const { score, best, max, history, onRestart } = props;
  const correct = history.filter((h) => h.correct).length;
  return (
    <section className="final reveal">
      <span className="rank">{rankFor(score, max)}</span>
      <p className="big">{score}</p>
      <p className="of">
        out of {max} · {correct}/{history.length} best picks · your best {best}
      </p>
      <ol className="rounds">
        {history.map((h, i) => (
          <li key={i} className={outcome(h) === "best" ? "pass" : outcome(h) === "valid" ? "warn" : "fail"}>
            <span>
              Round {i + 1}: {h.correct ? "Best pick" : h.valid ? "Valid, not best" : "Broke a rule"}
            </span>
            <span>+{h.points}</span>
          </li>
        ))}
      </ol>
      <button className="btn big" onClick={onRestart}>
        Play again
      </button>
    </section>
  );
}
