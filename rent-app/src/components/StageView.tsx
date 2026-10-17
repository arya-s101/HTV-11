"use client";

import { useMemo, useState } from "react";
import { CATEGORY_LABEL, judgeCivic, type CivicResult } from "@/game/civic";
import { CMHC_TABLE, evidenceFor, lever, VERIFY_ITEMS } from "@/game/data";
import { consequence, fareFor, money } from "@/game/outcome";
import { buildQuestion, type DraftQuestion } from "@/game/question";
import { DIFFICULTY_INFO, reasoningScore, type Score } from "@/game/score";
import type { Character } from "@/game/sprite";
import type { CivicCategory, Difficulty, NegotiatedTerms, Offer, PlayableStage, VerifyItemId } from "@/game/types";
import { Negotiation } from "./Negotiation";
import { Badge, formatValue, Num, Sprite } from "./pixel";

export interface StageRecord {
  stageId: string;
  stageTitle: string;
  age: number;
  difficulty: Difficulty;
  offerId: string;
  offerTitle: string;
  neighbourhood: string;
  negotiated: { fromCents: number; toCents: number; extras: string[] } | null;
  flagged: VerifyItemId[];
  unknowns: VerifyItemId[];
  flaggedRevealed: boolean;
  leverCorrect: boolean;
  civicCorrect: number;
  civicTotal: number;
  score: Score;
  question: DraftQuestion;
  personalAction: string | null;
}

const STEPS = ["Start", "Choose", "Negotiate", "Consequence", "Evidence", "Civic turn", "Question"] as const;
type Step = (typeof STEPS)[number];
const CATEGORIES: CivicCategory[] = ["personal", "municipal", "non-municipal"];
const ILLUS = { status: "illustrative" as const, geography: "Fictional scenario", reference_period: "2026 dollars", source_url: null };
const BED_WORD: Record<string, string> = { studio: "bachelor", "1br": "1-bedroom", "2br": "2-bedroom" };

export function StageView(props: {
  stage: PlayableStage;
  age: number;
  character: Character;
  difficulty: Difficulty;
  scriptedLandlord: boolean;
  onComplete: (r: StageRecord) => void;
  onSkip: () => void;
}) {
  const { stage, age, character, difficulty, scriptedLandlord, onComplete, onSkip } = props;
  const [step, setStep] = useState<Step>("Start");
  const [flagged, setFlagged] = useState<VerifyItemId[]>([]);
  const [decoded, setDecoded] = useState<Record<string, string>>({});
  const [offerId, setOfferId] = useState<string | null>(null);
  const [terms, setTerms] = useState<NegotiatedTerms | undefined>(undefined);
  const [negotiating, setNegotiating] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [tablePick, setTablePick] = useState<{ zone: string; col: string } | null>(null);
  const [assign, setAssign] = useState<Record<string, CivicCategory>>({});
  const [civic, setCivic] = useState<CivicResult | null>(null);

  const go = (s: Step) => {
    setStep(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const c = offerId ? consequence({ character, stage, offerId, revealed, terms }) : null;
  const ev = c ? evidenceFor(c.offer.neighbourhoodId) : null;
  const chosen = offerId ? stage.offers.find((o) => o.id === offerId)! : null;
  const municipal = stage.civicCards.find((x) => x.correct === "municipal")!;
  const question = useMemo(() => (c && ev ? buildQuestion(stage, c, ev, municipal.standard!) : null), [c, ev, stage, municipal]);
  const idx = STEPS.indexOf(step);

  const commuteDecoded = difficulty === "hard" && chosen ? (decoded[chosen.id] ? Number(decoded[chosen.id]) === chosen.commuteMinutes : false) : null;
  const tableRead = difficulty === "hard" && chosen && ev ? (tablePick ? tablePick.zone === ev.zone.code && tablePick.col === chosen.cmhcBedroom : false) : null;

  return (
    <section>
      <div className="steps" aria-label="Stage steps">
        {STEPS.map((s, i) => (
          <span key={s} className={`tab ${i === idx ? "on" : i < idx ? "done" : ""}`}>
            {i + 1}. {s}
            {s === "Negotiate" ? " (optional)" : ""}
          </span>
        ))}
        <span className="tab diff">{DIFFICULTY_INFO[difficulty].label}</span>
      </div>

      {step === "Start" && (
        <div className="paper scene">
          <div className="sprite-frame">
            <Sprite appearance={character.appearance} scale={7} />
          </div>
          <div>
            <span className="eyebrow">
              Stage {stage.order}: {stage.title} · age {age}
            </span>
            <h2>
              {character.name}, {age}: {stage.housingNeed.toLowerCase()}
            </h2>
            <p>
              {stage.household}. Heading to {stage.destination.name}, {stage.commuteDaysPerMonth} days a month by TTC.
            </p>
            <div className="chips">
              <span className="chip">
                Income: {money(stage.income.amountCents)}/{stage.income.period === "annual" ? "yr" : "mo"} {stage.income.basis} ({stage.income.description})
                <Badge f={ILLUS} />
              </span>
              <span className="chip">
                Trips: {stage.commuteDaysPerMonth * 2} one-way/mo
                <Badge f={ILLUS} />
              </span>
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => go("Choose")}>
                See the offers ▶
              </button>
              <button className="btn ghost small" onClick={onSkip}>
                Skip this stage
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "Choose" && (
        <div className="stack">
          <div className="paper">
            <span className="eyebrow">Before you choose · {DIFFICULTY_INFO[difficulty].label}</span>
            <h2>What would you check before signing?</h2>
            <p className="muted">
              {DIFFICULTY_INFO[difficulty].blurb} There&apos;s no single correct home: each one trades off money, time and missing information.
            </p>
            <div className="checklist">
              {VERIFY_ITEMS.map((v) => (
                <label key={v.id}>
                  <input
                    type="checkbox"
                    checked={flagged.includes(v.id)}
                    onChange={(e) => setFlagged(e.target.checked ? [...flagged, v.id] : flagged.filter((x) => x !== v.id))}
                  />
                  {v.label}
                </label>
              ))}
            </div>
          </div>
          <div className="offers">
            {stage.offers.map((o, i) => (
              <OfferCard
                key={o.id}
                o={o}
                letter={String.fromCharCode(65 + i)}
                difficulty={difficulty}
                decodedValue={decoded[o.id] ?? ""}
                onDecode={(v) => setDecoded({ ...decoded, [o.id]: v })}
                onChoose={() => {
                  setOfferId(o.id);
                  setTerms(undefined);
                  setRevealed(false);
                  setNegotiating(false);
                  go("Negotiate");
                }}
              />
            ))}
          </div>
        </div>
      )}

      {step === "Negotiate" && chosen && (
        <div className="stack">
          {!negotiating ? (
            <div className="paper">
              <span className="eyebrow">Before you sign</span>
              <h2>
                {chosen.title} in {evidenceFor(chosen.neighbourhoodId).name}: {money(chosen.rentCents)}/mo listed
              </h2>
              <p className="muted">You can sign at the listed terms or try negotiating first. Negotiating is optional and never needed to finish the stage.</p>
              <div className="row">
                <button className="btn" onClick={() => go("Consequence")}>
                  Sign at listed terms
                </button>
                <button className="btn blue" onClick={() => setNegotiating(true)}>
                  Negotiate with the landlord
                </button>
                <button className="btn ghost small" onClick={() => go("Choose")}>
                  Back to offers
                </button>
              </div>
            </div>
          ) : (
            <Negotiation
              stageId={stage.id}
              offer={chosen}
              difficulty={difficulty}
              scripted={scriptedLandlord}
              onAccept={(t) => {
                setTerms(t.rentCents !== chosen.rentCents || t.concessions.length ? t : undefined);
                go("Consequence");
              }}
              onWalk={() => {
                setOfferId(null);
                setNegotiating(false);
                go("Choose");
              }}
            />
          )}
        </div>
      )}

      {step === "Consequence" && c && chosen && (
        <div className="paper">
          <span className="eyebrow">Consequence</span>
          <h2>
            You chose: {c.offer.title} in {ev!.name}
          </h2>
          <table className="table">
            <tbody>
              {c.fields.map((f) => (
                <tr key={f.label}>
                  <td>
                    {f.label}
                    {f.note && <span className="note">{f.note}</span>}
                  </td>
                  <td className="v">
                    <Num f={f} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="compare">
            {c.comparisons.map((x) => (
              <div key={x.offerId}>
                Compared with {x.title} in {evidenceFor(x.neighbourhoodId).name}: rent{" "}
                <b>{x.rentDiffCents === 0 ? "the same" : `${x.rentDiffCents > 0 ? "+" : "−"}${money(Math.abs(x.rentDiffCents))}`}</b>, commuting{" "}
                <b>{x.hoursDiff === 0 ? "the same" : `${x.hoursDiff > 0 ? "+" : "−"}${Math.abs(x.hoursDiff)} h/mo`}</b>, TTC fare <b>$0 difference</b>
                <Badge f={{ ...ILLUS, status: "derived" }} />
              </div>
            ))}
          </div>
          <p className="note" style={{ marginTop: 10 }}>
            Money and time are shown separately on purpose. Time is never converted into dollars.
          </p>

          <div className="decode-box">
            <h3>What you caught vs. missed</h3>
            <ul className="plain">
              {chosen.unknowns.map((u) => (
                <li key={u} className={flagged.includes(u) ? "yes" : "no"}>
                  {flagged.includes(u) ? "✓ Flagged" : "✗ Missed"}: {VERIFY_ITEMS.find((v) => v.id === u)!.label.toLowerCase()}
                </li>
              ))}
              {difficulty === "hard" && (
                <li className={commuteDecoded ? "yes" : "no"}>
                  {commuteDecoded ? "✓ Decoded" : "✗ Not decoded"}: commute from route legs (you wrote {decoded[chosen.id] ? `${decoded[chosen.id]} min` : "nothing"}; the legs add up to{" "}
                  {chosen.commuteMinutes} min)
                </li>
              )}
            </ul>
          </div>

          {!revealed ? (
            <button className="btn blue" onClick={() => setRevealed(true)}>
              Reveal something you didn&apos;t know ▶
            </button>
          ) : (
            <div className="reveal-box">
              <h3>Unknown revealed: {c.offer.reveal.headline}</h3>
              <p>
                {c.offer.reveal.id === "utilities" && terms?.utilitiesIncluded
                  ? `${c.offer.reveal.text} You negotiated utilities into the rent, so that bill is covered.`
                  : c.offer.reveal.text}
              </p>
              <p className="small">
                {flagged.includes(c.offer.reveal.id) ? "✓ You flagged this before choosing. Good instinct." : "✗ You didn't flag this before choosing. Now you know to ask."}{" "}
                <Badge f={ILLUS} />
              </p>
              {c.offer.reveal.id === "rent-control" && (
                <p className="small">
                  Ontario rules: <a href={lever("rent-guideline").sources[0].url}>Residential rent increases (ontario.ca)</a>
                  <Badge f={{ status: "measured", geography: "Province of Ontario", reference_period: "2026 guideline", source_url: lever("rent-guideline").sources[0].url }} />
                </p>
              )}
              <button className="btn" onClick={() => go("Evidence")}>
                See the Toronto evidence ▶
              </button>
            </div>
          )}
        </div>
      )}

      {step === "Evidence" && c && ev && chosen && (
        <div className="paper">
          <span className="eyebrow">Evidence: real Toronto data</span>
          <h2>What the data says about {ev.name}</h2>
          {difficulty === "hard" && (
            <div className="table-task">
              <h3>Read the table: find the CMHC average for a vacant {BED_WORD[chosen.cmhcBedroom]} apartment in {ev.name}&apos;s survey zone</h3>
              <p className="small muted">
                {ev.name} is in CMHC survey zone {Number(ev.zone.code)}. {CMHC_TABLE.title}. Click the cell. Letters are CMHC quality grades; “**” means suppressed.
              </p>
              <div className="raw-wrap">
                <table className="raw">
                  <thead>
                    <tr>
                      <th>Zone</th>
                      {CMHC_TABLE.columns.map((col) => (
                        <th key={col}>{BED_WORD[col]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CMHC_TABLE.rows.map((r) => (
                      <tr key={r.zoneCode}>
                        <td>{r.zoneLabel}</td>
                        {CMHC_TABLE.columns.map((col) => {
                          const cell = r.cells[col];
                          const picked = tablePick?.zone === r.zoneCode && tablePick.col === col;
                          const right = tablePick && r.zoneCode === ev.zone.code && col === chosen.cmhcBedroom;
                          return (
                            <td key={col} className={`${picked ? "picked" : ""} ${right ? "right" : ""}`}>
                              <button className="cellbtn" disabled={!!tablePick} onClick={() => setTablePick({ zone: r.zoneCode, col })}>
                                {cell.value === null ? "**" : `${(cell.value / 100).toLocaleString("en-CA")} ${cell.quality ?? ""}`}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {tablePick && (
                <p className={tableRead ? "yes" : "no"}>
                  {tableRead ? "✓ Right cell." : `✗ Not quite: it's the ${Number(ev.zone.code)} row, ${BED_WORD[chosen.cmhcBedroom]} column (highlighted).`}
                </p>
              )}
            </div>
          )}
          {(difficulty !== "hard" || tablePick) && (
            <div className="facts">
              <Fact
                title={`CMHC average rent, vacant ${BED_WORD[chosen.cmhcBedroom]} apartments`}
                f={ev.cmhcRent[chosen.cmhcBedroom]}
                caveat={
                  (ev.cmhcRent[chosen.cmhcBedroom].value === null
                    ? "CMHC suppressed this value (too few units to publish reliably), so it stays unknown. "
                    : "A survey-zone average, not a live asking rent and not this neighbourhood's price. ") +
                  (chosen.unitType === "room" ? "CMHC doesn't publish room rents, so this is not a room price." : "")
                }
              />
              <Fact title="Tenant households spending 30%+ of income on shelter" f={ev.tenantShelter30} caveat="2021 Census; incomes refer to 2020. Different year and geography from the CMHC figure." />
              <Fact title="Median monthly shelter cost, rented dwellings" f={ev.medianRentedShelterCost} caveat="2021 Census. Includes utilities paid by tenants; not today's rent." />
              <Fact
                title="TTC fare rule used"
                f={{ value: fareFor(stage).cents, unit: "CAD cents/month", geography: "City of Toronto (TTC)", reference_period: "September 2026 fares", source_url: "https://www.ttc.ca/news/2026/September/Back-to-school-on-the-TTC", status: "derived" }}
                caveat="$3.30 adult fare, free transfers within 2 hours, free after 47 paid trips a month (same payment method). Your actual cost varies with other trips and discounts."
              />
            </div>
          )}
          <button className="btn" disabled={difficulty === "hard" && !tablePick} onClick={() => go("Civic turn")}>
            Who can change this? ▶
          </button>
        </div>
      )}

      {step === "Civic turn" && (
        <div className="paper">
          <span className="eyebrow">Civic turn</span>
          <h2>What would you verify yourself, and what public decision affects this for many renters?</h2>
          <p className="muted">Sort each statement.</p>
          {stage.civicCards.map((card) => {
            const fb = civic?.feedback.find((f) => f.card.id === card.id);
            return (
              <div key={card.id} className="sort-card">
                <div>
                  <b>“{card.text}”</b>
                </div>
                <div className="opts">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      className={`choice ${assign[card.id] === cat ? "on" : ""}`}
                      disabled={!!civic}
                      onClick={() => setAssign({ ...assign, [card.id]: cat })}
                      aria-pressed={assign[card.id] === cat}
                    >
                      {CATEGORY_LABEL[cat]}
                    </button>
                  ))}
                </div>
                {fb && (
                  <div className={`verdict ${fb.correct ? "ok" : "bad"}`}>
                    <b>{fb.correct ? "✓ " : `✗ It's “${CATEGORY_LABEL[fb.card.correct]}”. `}</b>
                    {fb.text}
                    {fb.sources.length > 0 && (
                      <div className="src">
                        Sources:{" "}
                        {fb.sources.map((s, i) => (
                          <span key={s.url}>
                            {i > 0 && " · "}
                            <a href={s.url} target="_blank" rel="noreferrer">
                              {s.title}
                            </a>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!civic ? (
            <button className="btn" disabled={stage.civicCards.some((x) => !assign[x.id])} onClick={() => setCivic(judgeCivic(stage.civicCards, assign))}>
              Check my sorting
            </button>
          ) : (
            <button className="btn" onClick={() => go("Question")}>
              Draft my question ▶
            </button>
          )}
        </div>
      )}

      {step === "Question" && question && civic && c && chosen && (
        <QuestionStep
          question={question}
          civic={civic}
          offerLabel={`${c.offer.title} in ${ev!.name}`}
          score={reasoningScore({
            difficulty,
            unknownsFlagged: chosen.unknowns.filter((u) => flagged.includes(u)).length,
            unknownsTotal: chosen.unknowns.length,
            leverCorrect: civic.leverCorrect,
            otherCardsCorrect: civic.feedback.filter((f) => f.card.correct !== "municipal" && f.correct).length,
            otherCardsTotal: stage.civicCards.length - 1,
            commuteDecoded,
            tableRead,
          })}
          onSave={(score) =>
            onComplete({
              stageId: stage.id,
              stageTitle: stage.title,
              age,
              difficulty,
              offerId: chosen.id,
              offerTitle: chosen.title,
              neighbourhood: ev!.name,
              negotiated: terms ? { fromCents: terms.askingCents, toCents: terms.rentCents, extras: terms.concessions.map((x) => x.label) } : null,
              flagged,
              unknowns: chosen.unknowns,
              flaggedRevealed: flagged.includes(chosen.reveal.id),
              leverCorrect: civic.leverCorrect,
              civicCorrect: civic.correctCount,
              civicTotal: stage.civicCards.length,
              score,
              question,
              personalAction: civic.personalAction?.text ?? null,
            })
          }
        />
      )}
    </section>
  );
}

function OfferCard(props: { o: Offer; letter: string; difficulty: Difficulty; decodedValue: string; onDecode: (v: string) => void; onChoose: () => void }) {
  const { o, letter, difficulty, decodedValue, onDecode, onChoose } = props;
  const e = evidenceFor(o.neighbourhoodId);
  return (
    <article className="paper offer">
      <div className="illus">Illustrative scenario, not an available listing</div>
      <h3>
        Offer {letter}: {o.title}
      </h3>
      <div className="where">
        📍 {e.name}
        <span className="note">
          CMHC survey zone: {e.zone.label}
          <Badge f={{ status: "derived", geography: e.zone.assignment, reference_period: "provisional", source_url: null }} />
        </span>
      </div>

      {difficulty === "easy" && (
        <>
          <dl className="kv">
            <dt>Listed rent</dt>
            <dd>
              {money(o.rentCents)}/mo
              <Badge f={ILLUS} />
            </dd>
            <dt>Utilities</dt>
            <dd>
              {o.utilities.status === "unknown" ? "Unknown" : "Included"}
              <Badge f={{ ...ILLUS, status: o.utilities.status }} />
            </dd>
            <dt>Commute, one way</dt>
            <dd>
              {o.commuteMinutes} min
              <Badge f={{ ...ILLUS, reference_period: "not a computed route" }} />
            </dd>
          </dl>
          <p className="note">{o.utilities.note}</p>
        </>
      )}

      {difficulty === "normal" && (
        <>
          <p className="ad">
            “{o.presentation.listingText}”
            <Badge f={ILLUS} />
          </p>
          <dl className="kv">
            <dt>Commute, one way</dt>
            <dd>
              {o.commuteMinutes} min
              <Badge f={{ ...ILLUS, reference_period: "not a computed route" }} />
            </dd>
          </dl>
        </>
      )}

      {difficulty === "hard" && (
        <>
          <p className="fineprint">
            {o.presentation.finePrint}
            <Badge f={ILLUS} />
          </p>
          <div className="legs">
            <div className="small muted">Route (illustrative, not a computed route):</div>
            <ol>
              {o.presentation.routeLegs.map((l, i) => (
                <li key={i}>
                  {l.label} · {l.minutes} min
                </li>
              ))}
            </ol>
            <label className="small">
              Total one-way (min):{" "}
              <input className="field-input mini" inputMode="numeric" value={decodedValue} onChange={(ev) => onDecode(ev.target.value.replace(/\D/g, "").slice(0, 3))} aria-label={`Offer ${letter} total commute minutes`} />
            </label>
          </div>
        </>
      )}

      <button className="btn" onClick={onChoose}>
        Choose offer {letter}
      </button>
    </article>
  );
}

function QuestionStep(props: { question: DraftQuestion; civic: CivicResult; offerLabel: string; score: Score; onSave: (s: Score) => void }) {
  const { question, civic, offerLabel, score, onSave } = props;
  return (
    <div className="paper">
      <span className="eyebrow">Your question for municipal candidates</span>
      <span className="draft-tag">Draft question · not an endorsement or a predicted outcome</span>
      <p className="question">{question.text}</p>
      <p className="small">
        Built from your choice ({offerLabel}), the lever ({question.leverName}) and a measurable outcome ({question.measurableOutcome}).
      </p>
      <ul className="cites">
        {question.citations.map((x) => (
          <li key={x.label}>{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.label}</a> : x.label}</li>
        ))}
      </ul>
      {civic.personalAction && (
        <p className="small" style={{ marginTop: 12 }}>
          Your personal step before signing: <b>{civic.personalAction.text}</b>
        </p>
      )}
      <ScoreBox score={score} />
      <button className="btn green" onClick={() => onSave(score)}>
        Save to civic notebook ▶
      </button>
    </div>
  );
}

export function ScoreBox({ score }: { score: Score }) {
  return (
    <div className="scorebox">
      <h3>
        Reasoning score: {score.total}
        {score.multiplier !== 1 && <span className="small"> ({score.base + score.decodeBonus} × {score.multiplier} difficulty)</span>}
      </h3>
      <ul className="plain small">
        {score.parts.map((p) => (
          <li key={p.label}>
            {p.label}: {p.points}/{p.max}
          </li>
        ))}
      </ul>
      <p className="note">Scored on how you reasoned, never on which home you picked, what you spent or how long you commute.</p>
    </div>
  );
}

function Fact({ title, f, caveat }: { title: string; f: Parameters<typeof Num>[0]["f"]; caveat: string }) {
  return (
    <div className="panel fact on-dark">
      <h3 style={{ color: "#f6eed9" }}>{title}</h3>
      <div className="val">
        {formatValue(f)}
        <Badge f={f} />
      </div>
      <div className="small">
        <div>Where: {f.geography}</div>
        <div>When: {f.reference_period}</div>
        {f.source_ref && <div className="note">Cell: {f.source_ref}</div>}
      </div>
      <p className="small" style={{ marginTop: 8 }}>
        {caveat}
      </p>
    </div>
  );
}
