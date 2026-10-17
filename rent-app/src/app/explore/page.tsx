"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AreaResult, RecommendResult } from "@/lib/recommend";

type Response = RecommendResult & { explanation: string[] };

const money = (cents: number | null) =>
  cents === null ? "unknown" : `${cents < 0 ? "-" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-CA")}`;
const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);
const signedMoney = (c: number | null) => (c === null ? "unknown" : c <= 0 ? `${money(-c)} under` : `${money(c)} over`);
const signedMin = (m: number | null) => (m === null ? "unknown" : m <= 0 ? `${-m} min under` : `${m} min over`);

export default function Home() {
  const [destinations, setDestinations] = useState<{ id: string; name: string }[]>([]);
  const [depWindow, setDepWindow] = useState<{ start: string; minutes: number } | null>(null);
  const [form, setForm] = useState({
    income: "55000",
    period: "annual",
    basis: "gross",
    cap: "1800",
    bedrooms: "1br",
    householdSize: "1",
    destinationId: "union",
    limit: "45",
    days: "20",
    otherTrips: "0",
    preference: "money",
    utilities: "",
  });
  const [result, setResult] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/recommend")
      .then((r) => r.json())
      .then((d) => {
        setDestinations(d.destinations);
        setDepWindow(d.departureWindow);
      });
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const dollars = (s: string) => Math.round(Number(s) * 100);
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        income: { amountCents: dollars(form.income), period: form.period, basis: form.basis },
        housingCapCents: dollars(form.cap),
        bedrooms: form.bedrooms,
        householdSize: Number(form.householdSize),
        destinationId: form.destinationId,
        commuteMode: "transit",
        commuteLimitMinutes: Number(form.limit),
        commuteDaysPerMonth: Number(form.days),
        otherPaidTripsPerMonth: Number(form.otherTrips),
        preference: form.preference,
        knownMonthlyUtilitiesCents: form.utilities.trim() === "" ? null : dollars(form.utilities),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Request failed");
      setResult(null);
    } else {
      setResult(data);
    }
  }

  return (
    <main className="explore">
      <p className="small"><Link href="/">← Back to the game</Link></p>
      <h1>Toronto affordability boundary</h1>
      <p className="muted">
        Which Toronto neighbourhoods meet <strong>both</strong> your housing cap and your transit commute limit, and what
        has to change if none do. This screens areas using published benchmarks. It does not list apartments.
      </p>

      <form onSubmit={submit}>
        <label>
          Household income ($)
          <input type="number" min="0" step="1" value={form.income} onChange={set("income")} required />
        </label>
        <label>
          Income period
          <select value={form.period} onChange={set("period")}>
            <option value="annual">Annual</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label>
          Income basis
          <select value={form.basis} onChange={set("basis")}>
            <option value="gross">Gross (before tax)</option>
            <option value="net">Net (take-home)</option>
          </select>
        </label>
        <label>
          Monthly housing cap ($)
          <input type="number" min="1" step="1" value={form.cap} onChange={set("cap")} required />
        </label>
        <label>
          Bedrooms
          <select value={form.bedrooms} onChange={set("bedrooms")}>
            <option value="studio">Studio</option>
            <option value="1br">1 bedroom</option>
            <option value="2br">2 bedrooms</option>
            <option value="3br+">3+ bedrooms</option>
          </select>
        </label>
        <label>
          Household size
          <input type="number" min="1" max="20" value={form.householdSize} onChange={set("householdSize")} required />
        </label>
        <label>
          Destination
          <select value={form.destinationId} onChange={set("destinationId")}>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          One-way transit limit (min)
          <input type="number" min="1" max="240" value={form.limit} onChange={set("limit")} required />
        </label>
        <label>
          Commute days / month
          <input type="number" min="0" max="31" value={form.days} onChange={set("days")} required />
        </label>
        <label>
          Other paid TTC trips / month
          <input type="number" min="0" value={form.otherTrips} onChange={set("otherTrips")} />
        </label>
        <label>
          Known utilities/fees ($/mo, blank = unknown)
          <input type="number" min="0" step="1" value={form.utilities} onChange={set("utilities")} />
        </label>
        <label>
          Prefer
          <select value={form.preference} onChange={set("preference")}>
            <option value="money">Saving money</option>
            <option value="time">Saving time</option>
          </select>
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Checking…" : "Check areas"}
        </button>
      </form>
      {depWindow && (
        <p className="muted small">
          Mode: TTC transit + walking, weekday departures {depWindow.start.replace("T", " ")} for {depWindow.minutes} min (scheduled
          service). Only the listed destinations have computed routes.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      {result && <Results r={result} />}
    </main>
  );
}

function Results({ r }: { r: Response }) {
  const none = r.feasible.length === 0;
  return (
    <>
      <div className="summary">
        {r.explanation.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>

      <h2 className={none ? "fail" : "pass"}>
        {none ? "No area meets both limits" : `${r.feasible.length} area${r.feasible.length === 1 ? "" : "s"} meet both limits`}
      </h2>
      {!none && <AreaTable areas={r.feasible} />}

      {r.nearHousing.length > 0 && (
        <>
          <h2>Commute fits, rent benchmark too high</h2>
          <AreaTable areas={r.nearHousing} showChange />
        </>
      )}
      {r.nearCommute.length > 0 && (
        <>
          <h2>Rent fits, commute too long</h2>
          <AreaTable areas={r.nearCommute} showChange />
        </>
      )}
      <p className="muted small">
        Also: {r.counts["misses-both"]} areas miss both limits; {r.counts.unknown} have no published benchmark or route and
        cannot pass.
      </p>

      <h2>What this does and does not show</h2>
      <ul className="notes small">
        {r.provisional.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
        <li>Commute time is shown in minutes and never converted to dollars.</li>
      </ul>
      <h2>Sources</h2>
      <ul className="notes small">
        {r.sources.map((s, i) => (
          <li key={i}>
            {s.url ? <a href={s.url}>{s.label}</a> : s.label}: {s.detail}
          </li>
        ))}
      </ul>
    </>
  );
}

function AreaTable({ areas, showChange }: { areas: AreaResult[]; showChange?: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Neighbourhood</th>
            <th>Rent benchmark (scope)</th>
            <th>vs cap</th>
            <th>Transit (p25–p75)</th>
            <th>vs limit</th>
            <th>Rent / income</th>
            <th>TTC / mo</th>
            <th>Housing + commute est.</th>
            {showChange && <th>Change needed</th>}
          </tr>
        </thead>
        <tbody>
          {areas.map((a) => (
            <tr key={a.neighbourhoodId}>
              <td>
                {a.neighbourhoodName}
                {a.rent.straddlesZones && (
                  <div className="warn small">Straddles zones ({Math.round(a.rent.zoneShareOfNeighbourhood * 100)}% in assigned)</div>
                )}
              </td>
              <td className="small">
                <span className="num">{money(a.rent.benchmarkCents)}</span> {a.rent.zoneLabel}
                <div className="muted">
                  CMHC Oct 2025 vacant-unit mean, quality {a.rent.quality ?? "–"}
                  {a.rent.quality === "d" && <span className="warn"> (use with caution)</span>}
                </div>
              </td>
              <td className={`num ${a.housingVerdict}`}>{signedMoney(a.housingGapCents)}</td>
              <td className="num">
                {a.commute.minutesP50 ?? "?"} min
                <div className="muted small">
                  {a.commute.minutesP25}–{a.commute.minutesP75}
                </div>
              </td>
              <td className={`num ${a.commuteVerdict}`}>{signedMin(a.commuteGapMinutes)}</td>
              <td className="num">{pct(a.rentBurden)}</td>
              <td className="num">{money(a.transport.cents)}</td>
              <td className="num">
                {money(a.housingPlusCommuteCents)}
                {!a.housingCostIncludesUtilities && <div className="muted small">excl. utilities</div>}
              </td>
              {showChange && (
                <td className="small">
                  {a.requiredChange.housingCapIncreaseCents ? `Raise cap +${money(a.requiredChange.housingCapIncreaseCents)}/mo` : ""}
                  {a.requiredChange.commuteLimitIncreaseMinutes ? `Allow +${a.requiredChange.commuteLimitIncreaseMinutes} min` : ""}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
