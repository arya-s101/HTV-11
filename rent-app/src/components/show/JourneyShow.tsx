"use client";

// The rental journey presented as a pixel-art game show (PRD v2 §5.10, PRD v3). Logic and data come from
// src/game/journey.ts and the mode config (src/config/modes.ts); this file only sequences beats:
// host lines → big choices → reveal → stat card → next.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MODES, SKIPPABLE_AFTER_BASE, type Mode, type RoundId } from "@/config/modes";
import { ELECTION_HUB, evidenceFor, VERIFY_ITEMS } from "@/game/data";
import {
  belowBenchmark,
  content,
  disputedDefect,
  eventsFor,
  J,
  judgeListing,
  leaseFor,
  levelCorrect,
  listingsFor,
  photoOutcome,
  reportCard,
  SCAM_REPORT_OPTIONS,
  viewingQuestionsFor,
  type Flag,
  type JourneyEvent,
  type JourneyResult,
  type Level,
  type Listing,
  type ViewingQuestion,
} from "@/game/journey";
import { consequence, money } from "@/game/outcome";
import { buildCityQuestion, buildQuestion, type DraftQuestion } from "@/game/question";
import { DIFFICULTY_INFO } from "@/game/score";
import type { Character } from "@/game/sprite";
import type { Difficulty, NegotiatedTerms, Offer, PlayableStage, VerifyItemId } from "@/game/types";
import { Negotiation } from "../Negotiation";
import { Sprite } from "../pixel";
import { Choices, Confetti, Counter, Host, LinePlayer, ProvChip, Reveal, SHOW, TimerBadge, TitleCard, useCountdown, Why } from "./primitives";
import { useSettings, useSfx, type TextSpeed } from "./settings";
import { StatRun, useStatGate } from "./StatCard";

const ILLUS = { status: "illustrative" as const, geography: "Fictional scenario", reference_period: "2026 dollars", source_url: null };
const DERIVED = { ...ILLUS, status: "derived" as const };
type LifelineId = "hint" | "magnify" | "pass";
const PTS = SHOW.points;
const LISTING_SECONDS: Record<Difficulty, number> = { easy: 15, normal: 12, hard: 10 };

/** Split text into on-screen lines at sentence ends. */
const sentences = (t: string) => t.match(/[^.!?]+[.!?]*["”]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [t];
const isBest = (e: JourneyEvent, id?: string) => !!e.actions.find((a) => a.id === id && (a as { best?: boolean }).best);

/** What a finished Base game hands to Extended, so the same player can skip what they already played. */
export interface BaseCarry {
  scams: { correct: number; total: number };
  photos: boolean;
  eventIds: string[];
}

// ---------- show context: score, receipts, lifelines ----------
interface ShowCtx {
  score: number;
  addPoints: (n: number) => void;
  lifelines: Record<LifelineId, boolean>; // true = still available
  arm: (handlers: Partial<Record<LifelineId, () => void>>) => void;
}
const Ctx = createContext<ShowCtx | null>(null);
const useShow = () => useContext(Ctx)!;

/** A round arms the lifelines that make sense right now; the podium buttons call them. */
function useLifelines(handlers: Partial<Record<LifelineId, () => void>>, deps: unknown[]) {
  const { arm } = useShow();
  useEffect(() => {
    arm(handlers);
    return () => arm({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

type EventAns = Record<string, { action?: string; level?: Level; skipped?: boolean }>;
interface Results {
  scams: { correct: number; total: number } | null;
  scamReport?: boolean;
  verify: VerifyItemId[];
  offerId: string | null;
  viewing?: { right: number; total: number };
  docs: Record<string, boolean>;
  rivalDelta: number;
  terms?: NegotiatedTerms;
  lease: Record<string, "problem" | "fine" | "skip">;
  photos: boolean | null;
  insured?: boolean;
  events: EventAns;
  notice: string | null;
}

// =====================================================================
export function JourneyShow(props: {
  stage: PlayableStage;
  age: number;
  character: Character;
  difficulty: Difficulty;
  seed: number;
  mode: Mode;
  /** Set when Extended starts straight after a Base game with the same character. */
  carry?: BaseCarry;
  scriptedLandlord: boolean;
  onReplay: () => void;
  onQuit: () => void;
  onExtended: (carry: BaseCarry) => void;
}) {
  return (
    <StatRun>
      <Show {...props} />
    </StatRun>
  );
}

function Show(props: Parameters<typeof JourneyShow>[0]) {
  const { stage, age, character, difficulty, seed, mode, carry, scriptedLandlord, onReplay, onQuit, onExtended } = props;
  const cfg = MODES[mode];
  const [skipPlayed, setSkipPlayed] = useState(false);
  const rounds = cfg.rounds.filter((r) => !(skipPlayed && SKIPPABLE_AFTER_BASE.includes(r)));
  const [round, setRound] = useState<RoundId | "welcome">("welcome");
  const [intro, setIntro] = useState(true);
  const [score, setScore] = useState(0);
  const [bump, setBump] = useState<number | null>(null);
  const [lifelines, setLifelines] = useState<Record<LifelineId, boolean>>({ hint: true, magnify: true, pass: true });
  const armed = useRef<Partial<Record<LifelineId, () => void>>>({});
  const [armedKeys, setArmedKeys] = useState<LifelineId[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [shake, setShake] = useState(false);
  const { still } = useSettings();

  const listings = useMemo(() => listingsFor(stage, difficulty, seed, cfg.listings), [stage, difficulty, seed, cfg.listings]);
  const offers = useMemo(() => (cfg.offerIds ? stage.offers.filter((o) => cfg.offerIds!.includes(o.id)) : stage.offers), [stage, cfg.offerIds]);
  const events = useMemo(() => eventsFor(cfg.events, seed, skipPlayed ? carry?.eventIds : []), [cfg.events, seed, skipPlayed, carry]);
  const viewingQs = useMemo(() => viewingQuestionsFor(seed, cfg.viewingQuestions), [seed, cfg.viewingQuestions]);
  const [res, setRes] = useState<Results>({ scams: null, verify: [], offerId: null, docs: {}, rivalDelta: 0, lease: {}, photos: null, events: {}, notice: null });
  const patch = (p: Partial<Results>) => setRes((r) => ({ ...r, ...p }));

  const addPoints = useCallback((n: number) => {
    if (n <= 0) return;
    setScore((s) => s + n);
    setBump(n);
    setTimeout(() => setBump(null), 900);
  }, []);
  const ctx: ShowCtx = useMemo(
    () => ({
      score,
      addPoints,
      lifelines,
      arm: (h) => {
        armed.current = h;
        setArmedKeys(Object.keys(h) as LifelineId[]);
      },
    }),
    [score, addPoints, lifelines],
  );
  const triggerLifeline = (id: LifelineId) => {
    const fn = armed.current[id];
    if (!fn || !lifelines[id]) return;
    setLifelines((l) => ({ ...l, [id]: false }));
    fn();
  };

  /** Moves to the round after `from` in this mode's order. */
  const after = (from: RoundId) => {
    const next = rounds[rounds.indexOf(from) + 1] ?? "report";
    setRound(next);
    setIntro(true);
    window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
  };
  const start = () => {
    setRound(rounds[0]);
    setIntro(true);
  };
  const wrongShake = () => {
    if (still) return;
    setShake(true);
    setTimeout(() => setShake(false), 400);
  };

  const offer = res.offerId ? stage.offers.find((o) => o.id === res.offerId)! : null;
  const agreedTerms: NegotiatedTerms | undefined =
    res.terms ?? (offer && res.rivalDelta ? { rentCents: offer.rentCents + res.rivalDelta, askingCents: offer.rentCents, utilitiesIncluded: false, concessions: [] } : undefined);
  const reached = (r: RoundId) => round !== "welcome" && rounds.indexOf(round) >= rounds.indexOf(r) && rounds.includes(r);

  const receipts = [
    ...(res.photos ? ["📷 Move-in photos"] : []),
    ...events.filter((e) => isBest(e, res.events[e.id]?.action) && ["write", "tell"].includes(res.events[e.id]!.action!)).map((e) => `✉ ${e.title}`),
    ...(cfg.rounds.includes("lease") && reached("movein") ? ["📝 Signed lease"] : []),
  ];

  const roundNo = (r: RoundId) => rounds.indexOf(r) + 1;
  const titleFor = (r: RoundId) => (SHOW.rounds as Record<string, { title: string; intro: string[] }>)[r];

  return (
    <Ctx.Provider value={ctx}>
      <div className={`show ${shake ? "shake" : ""}`}>
        {/* ---------- podium bar ---------- */}
        <div className="podium-bar">
          <div className="podium">
            <div className="podium-sprite">
              <Sprite appearance={character.appearance} scale={3} />
            </div>
            <div>
              <div className="pixel podium-name">
                {character.name}, {age}
              </div>
              <div className="small muted">
                {character.profession.path["first-job"]?.title} · {cfg.label}
              </div>
            </div>
          </div>
          <div className="score-box" aria-live="polite">
            <span className="small muted">Score</span>
            <span className={`pixel score ${bump ? "bumped" : ""}`}>{score}</span>
            {bump && !still && <span className="score-plus pixel">+{bump}</span>}
          </div>
          <div className="receipts" title={receipts.join("\n") || "No receipts yet"}>
            🧾 <span className="pixel">{receipts.length}</span>
            <span className="sr-only"> receipts</span>
          </div>
          <div className="lifelines" aria-label="Lifelines">
            {SHOW.lifelines.map((l) => {
              const id = l.id as LifelineId;
              const usable = lifelines[id] && armedKeys.includes(id);
              return (
                <button key={l.id} className={`lifeline ${lifelines[id] ? "" : "used"}`} disabled={!usable} onClick={() => triggerLifeline(id)} title={`${l.name}: ${l.help}${lifelines[id] ? "" : " (used)"}`} aria-label={`${l.name}: ${l.help}${lifelines[id] ? "" : " Already used."}`}>
                  <span aria-hidden="true">{l.icon}</span>
                  <span className="lifeline-name">{l.name}</span>
                </button>
              );
            })}
          </div>
          <div className="podium-actions">
            <button className="btn ghost small" onClick={() => setShowSettings(!showSettings)} aria-expanded={showSettings}>
              ⚙ Settings
            </button>
            <button className="btn ghost small" onClick={onQuit}>
              Quit
            </button>
          </div>
          {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
        </div>

        <div className="round-strip" aria-label="Rounds">
          {rounds.map((r) => (
            <span key={r} className={`dot-round ${r === round ? "on" : reached(r) ? "done" : ""}`} title={titleFor(r).title}>
              {r === "report" ? "★" : roundNo(r)}
            </span>
          ))}
        </div>

        {/* ---------- stage ---------- */}
        <div className="show-stage" key={`${round}-${intro}`}>
          {round === "welcome" && (
            <section className="title-card-show">
              <div className="card-banner">
                <div className="pixel round-no">Live from Toronto</div>
                <h2 className="round-title">{SHOW.showName}</h2>
              </div>
              <WelcomeBeat
                character={character}
                difficulty={difficulty}
                mode={mode}
                carry={carry}
                onGo={(skip) => {
                  if (skip && carry) {
                    setSkipPlayed(true);
                    patch({ scams: carry.scams, photos: carry.photos });
                    setRound(cfg.rounds.find((r) => !SKIPPABLE_AFTER_BASE.includes(r))!);
                    setIntro(true);
                  } else start();
                }}
              />
            </section>
          )}
          {round !== "welcome" && intro && round !== "report" && (
            <TitleCard number={roundNo(round)} title={titleFor(round).title} intro={titleFor(round).intro} onGo={() => setIntro(false)} />
          )}
          {round === "search" && !intro && (
            <SearchRound
              listings={listings}
              difficulty={difficulty}
              askReport={cfg.scamReport}
              onWrong={wrongShake}
              onDone={(flags, scamReport) => {
                const counted = listings.filter((l) => l.answer !== "legit" && flags[l.id] !== "skip");
                const correct = counted.filter((l) => {
                  const f = flags[l.id];
                  return f && f !== "timeout" && f !== "skip" && judgeListing(l.answer, f) !== "missed";
                }).length;
                patch({ scams: { correct, total: counted.length }, ...(cfg.scamReport ? { scamReport } : {}) });
                after("search");
              }}
            />
          )}
          {round === "viewing" && !intro && (
            <PickRound
              stage={stage}
              character={character}
              offers={offers}
              difficulty={difficulty}
              questions={viewingQs}
              revealHere={cfg.revealIn === "viewing"}
              onWrong={wrongShake}
              onDone={(offerId, verify, viewing) => {
                patch({ offerId, verify, viewing });
                after("viewing");
              }}
            />
          )}
          {round === "apply" && !intro && offer && (
            <ApplyRound
              onWrong={wrongShake}
              onWalk={() => {
                patch({ offerId: null, docs: {} });
                setRound("viewing");
                setIntro(true);
              }}
              onDone={(docs, rivalDelta) => {
                patch({ docs, rivalDelta });
                after("apply");
              }}
            />
          )}
          {round === "negotiate" && !intro && offer && (
            <NegotiateRound
              stageId={stage.id}
              offer={offer}
              difficulty={difficulty}
              scripted={scriptedLandlord}
              rivalDelta={res.rivalDelta}
              onDone={(terms) => {
                patch({ terms });
                after("negotiate");
              }}
            />
          )}
          {round === "lease" && !intro && offer && (
            <LeaseRound
              clauses={leaseFor(offer.id, seed, agreedTerms?.rentCents ?? offer.rentCents, difficulty)}
              difficulty={difficulty}
              onWrong={wrongShake}
              onDone={(lease) => {
                patch({ lease });
                after("lease");
              }}
            />
          )}
          {round === "movein" && !intro && offer && (
            <MoveInRound
              stage={stage}
              character={character}
              offer={offer}
              terms={agreedTerms}
              verify={res.verify}
              carriedPhotos={res.photos}
              askInsurance={cfg.insurance}
              revealHere={cfg.revealIn === "movein"}
              onWrong={wrongShake}
              onDone={(photos, insured) => {
                patch({ photos, insured });
                after("movein");
              }}
            />
          )}
          {round === "live" && !intro && (
            <LiveRound
              events={events}
              photos={!!res.photos}
              insured={res.insured}
              onWrong={wrongShake}
              onDone={(evs) => {
                patch({ events: evs });
                after("live");
              }}
            />
          )}
          {round === "moveout" && !intro && (
            <MoveOutRound
              photos={!!res.photos}
              seed={seed}
              onWrong={wrongShake}
              onDone={(notice) => {
                patch({ notice });
                after("moveout");
              }}
            />
          )}
          {round === "report" && offer && (
            <ReportRound
              stage={stage}
              character={character}
              age={age}
              offer={offer}
              terms={agreedTerms}
              difficulty={difficulty}
              seed={seed}
              mode={mode}
              res={res}
              events={events}
              receipts={receipts}
              onReplay={onReplay}
              onQuit={onQuit}
              onExtended={onExtended}
            />
          )}
        </div>
      </div>
    </Ctx.Provider>
  );
}

// =====================================================================
function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const speeds: TextSpeed[] = ["slow", "normal", "fast", "instant"];
  return (
    <div className="settings-pop" role="dialog" aria-label="Settings">
      <h3>Settings</h3>
      <div className="field">
        <div className="small muted">Text speed</div>
        <div className="seg">
          {speeds.map((sp) => (
            <button key={sp} className={`choice ${s.textSpeed === sp ? "on" : ""}`} onClick={() => s.set({ textSpeed: sp })} aria-pressed={s.textSpeed === sp}>
              {sp}
            </button>
          ))}
        </div>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={s.showStats} onChange={(e) => s.set({ showStats: e.target.checked })} /> Show stats
      </label>
      <label className="toggle">
        <input type="checkbox" checked={s.skipAnimations} onChange={(e) => s.set({ skipAnimations: e.target.checked })} /> Skip animations
      </label>
      <label className="toggle">
        <input type="checkbox" checked={s.sound} onChange={(e) => s.set({ sound: e.target.checked })} /> Sound effects
      </label>
      {s.reducedMotion && <p className="small muted">Your device asks for reduced motion, so movement is replaced with fades.</p>}
      <button className="btn small" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

function WelcomeBeat({ character, difficulty, mode, carry, onGo }: { character: Character; difficulty: Difficulty; mode: Mode; carry?: BaseCarry; onGo: (skipPlayed: boolean) => void }) {
  const [ready, setReady] = useState(false);
  const lines = carry
    ? ["Welcome back! This is the Extended game.", `${character.name} returns, same character.`, "Skip Spot the Fake, which you just played?"]
    : [...SHOW.welcome.slice(0, 2), `Our contestant: ${character.name}. ${MODES[mode].label}, ${DIFFICULTY_INFO[difficulty].label}.`];
  return (
    <>
      <Host lines={lines} onDone={() => setReady(true)} />
      <div className="choices">
        {carry ? (
          <>
            <button className="btn big" disabled={!ready} onClick={() => onGo(true)}>
              Skip played rounds ▶
            </button>
            <button className="btn ghost" disabled={!ready} onClick={() => onGo(false)}>
              Play everything
            </button>
          </>
        ) : (
          <button className="btn big" disabled={!ready} onClick={() => onGo(false)}>
            Start the show ▶
          </button>
        )}
      </div>
    </>
  );
}

// =====================================================================
// Spot the Fake
function SearchRound({ listings, difficulty, askReport, onWrong, onDone }: { listings: Listing[]; difficulty: Difficulty; askReport: boolean; onWrong: () => void; onDone: (flags: Record<string, Flag | "skip" | "timeout">, scamReport: boolean) => void }) {
  const { addPoints } = useShow();
  const [i, setI] = useState(0);
  const [flags, setFlags] = useState<Record<string, Flag | "skip" | "timeout">>({});
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState(false);
  const [magnified, setMagnified] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const l = listings[i];
  const answer = l ? flags[l.id] : undefined;
  const timeUp = useCallback(() => l && setFlags((f) => (f[l.id] ? f : { ...f, [l.id]: "timeout" })), [l]);
  const [left] = useCountdown(LISTING_SECONDS[difficulty], !!l && ready && !answer, timeUp);
  useLifelines(
    !l || answer
      ? {}
      : {
          hint: () => setHint(true),
          ...(difficulty === "hard" ? { magnify: () => setMagnified(true) } : {}),
          pass: () => setFlags((f) => ({ ...f, [l.id]: "skip" })),
        },
    [l?.id, answer],
  );
  const next = () => {
    setI(i + 1);
    setReady(false);
    setHint(false);
    setMagnified(false);
  };
  useEffect(() => {
    if (!l && !askReport) onDone(flags, false);
  }, [l, askReport]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!l) {
    if (!askReport) return null;
    const ok = SCAM_REPORT_OPTIONS.find((o) => o.id === report)?.correct;
    return report ? (
      <Reveal ok={!!ok} lines={[content("scam-report").short]} why={["scam-report"]} points={ok ? PTS.answer : 0} stat="scam-report" onNext={() => onDone(flags, !!ok)} nextLabel="Next round ▶" />
    ) : (
      <>
        <Host lines={["You spotted a scam listing.", "Who do you report it to?"]} onDone={() => setReady(true)} />
        <Choices
          options={SCAM_REPORT_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
          disabled={!ready}
          onPick={(id) => {
            setReport(id);
            if (SCAM_REPORT_OPTIONS.find((o) => o.id === id)?.correct) addPoints(PTS.answer);
            else onWrong();
          }}
        />
      </>
    );
  }

  const below = belowBenchmark(l.rentCents, l.benchmarkCents);
  const ev = evidenceFor(l.neighbourhoodId);
  if (answer) {
    const verdict = answer === "skip" ? null : answer === "timeout" ? "missed" : judgeListing(l.answer, answer);
    const ok = verdict === null ? null : verdict === "correct" || verdict === "caught";
    const headline = l.answer === "scam" ? "It's a scam!" : l.answer === "suspicious" ? "Suspicious!" : "Legit!";
    const lines =
      answer === "skip"
        ? ["Free Pass used. No harm done."]
        : [...(answer === "timeout" ? ["Time's up!"] : []), ...(l.redFlags.length ? l.redFlags.slice(0, answer === "timeout" ? 2 : 3).map((id) => content(id).short) : ["Nothing odd: viewings offered, no money up front."])];
    return <Reveal key={l.id} ok={ok} headline={headline} lines={lines} why={l.redFlags.length ? l.redFlags : undefined} points={ok ? PTS.answer : 0} stat={`listing:${l.answer}`} onNext={next} />;
  }

  return (
    <div className="beat" key={l.id}>
      <div className="beat-head">
        <span className="pixel small">
          Listing {i + 1} of {listings.length}
        </span>
        {ready && <TimerBadge left={left} total={LISTING_SECONDS[difficulty]} />}
      </div>
      <article className="listing-card">
        <div className="illus">Illustrative, not a real listing</div>
        <h3>
          {l.title} · {ev.name}
        </h3>
        {difficulty === "hard" && !magnified ? (
          <p className="fineprint dense">{l.text}</p>
        ) : (
          <LinePlayer lines={sentences(l.text)} onDone={() => setReady(true)} />
        )}
        {difficulty === "hard" && !magnified && !ready && (
          <button className="btn small ghost" onClick={() => setReady(true)}>
            I&apos;ve read it
          </button>
        )}
        <div className="counters">
          <Counter label="Rent" value={l.rentCents} format={(n) => `${money(Math.round(n))}`} f={ILLUS} />
          <Counter label="Area average (CMHC)" value={l.benchmarkCents} format={(n) => `${money(Math.round(n))}`} f={ev.cmhcRent[l.cmhcBedroom]} />
          {(difficulty === "easy" || hint) && below !== null && (
            <Counter label={below >= 0 ? "Below average" : "Above average"} value={Math.abs(Math.round(below * 100))} format={(n) => `${Math.round(n)}%`} f={DERIVED} />
          )}
        </div>
      </article>
      <Choices
        disabled={!ready}
        options={[
          { id: "legit", label: "✓ Legit" },
          { id: "suspicious", label: "? Suspicious" },
          { id: "scam", label: "✗ Scam" },
        ]}
        onPick={(f) => {
          const v = judgeListing(l.answer, f as Flag);
          if (v === "correct" || v === "caught") addPoints(PTS.answer);
          else onWrong();
          setFlags({ ...flags, [l.id]: f as Flag });
        }}
      />
    </div>
  );
}

// =====================================================================
// Pick Your Place: flag what to verify, choose a place, then (Extended) quick viewing questions,
// and (Base) the first-month reveal straight away.
function PickRound(props: {
  stage: PlayableStage;
  character: Character;
  offers: Offer[];
  difficulty: Difficulty;
  questions: ViewingQuestion[];
  revealHere: boolean;
  onWrong: () => void;
  onDone: (offerId: string, verify: VerifyItemId[], viewing?: { right: number; total: number }) => void;
}) {
  const { stage, character, offers, difficulty, questions, revealHere, onWrong, onDone } = props;
  const [step, setStep] = useState<"verify" | "choose" | "questions" | "reveal">("verify");
  const [verify, setVerify] = useState<VerifyItemId[]>([]);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [decoded, setDecoded] = useState(false);
  const [ready, setReady] = useState(false);
  useLifelines(step === "choose" && difficulty === "hard" ? { magnify: () => setDecoded(true) } : {}, [step]);
  const finish = (id: string, viewing?: { right: number; total: number }) => onDone(id, verify, viewing);

  if (step === "verify")
    return (
      <div className="beat">
        <Host lines={["Before you look: what will you double-check?", "Pick any. Then choose a place."]} onDone={() => setReady(true)} />
        <div className="choices n4 toggles">
          {VERIFY_ITEMS.map((v) => (
            <button key={v.id} className={`btn choice-big ${verify.includes(v.id) ? "picked" : ""}`} disabled={!ready} aria-pressed={verify.includes(v.id)} onClick={() => setVerify(verify.includes(v.id) ? verify.filter((x) => x !== v.id) : [...verify, v.id])}>
              {verify.includes(v.id) ? "☑" : "☐"} {v.label}
            </button>
          ))}
        </div>
        <div className="choices">
          <button className="btn big" disabled={!ready} onClick={() => (setReady(false), setStep("choose"))}>
            See the places ▶
          </button>
        </div>
      </div>
    );

  if (step === "choose")
    return (
      <div className="beat">
        <Host lines={[`${offers.length === 2 ? "Two" : "Three"} places. Each trades money, time and unknowns.`, "Which one do you take?"]} onDone={() => setReady(true)} />
        <div className={`doors n${offers.length}`}>
          {offers.map((o, n) => (
            <DoorCard
              key={o.id}
              o={o}
              letter={String.fromCharCode(65 + n)}
              difficulty={difficulty}
              decoded={decoded}
              disabled={!ready}
              onPick={() => {
                setOfferId(o.id);
                setStep(questions.length ? "questions" : revealHere ? "reveal" : "questions");
                if (!questions.length && !revealHere) finish(o.id);
              }}
            />
          ))}
        </div>
      </div>
    );

  if (step === "questions" && questions.length)
    return (
      <QuestionSet
        questions={questions}
        onWrong={onWrong}
        onDone={(right) => {
          if (revealHere) setStep("reveal");
          else finish(offerId!, { right, total: questions.length });
        }}
      />
    );

  const offer = stage.offers.find((o) => o.id === offerId)!;
  return <MonthReveal stage={stage} character={character} offer={offer} verify={verify} onDone={() => finish(offer.id)} />;
}

function DoorCard({ o, letter, difficulty, decoded, onPick, disabled }: { o: Offer; letter: string; difficulty: Difficulty; decoded: boolean; onPick: () => void; disabled: boolean }) {
  const ev = evidenceFor(o.neighbourhoodId);
  return (
    <article className="door">
      <div className="illus">Illustrative, not a real listing</div>
      <div className="door-letter pixel">{letter}</div>
      <h3>{o.title}</h3>
      <div className="small muted">
        {ev.name} · <ProvChip f={{ status: "derived", geography: ev.zone.assignment, reference_period: ev.zone.label, source_url: null }} />
      </div>
      <Counter label="Rent" value={o.rentCents} format={(n) => money(Math.round(n))} f={ILLUS} />
      {difficulty === "hard" && !decoded ? (
        <>
          <p className="fineprint dense">{o.presentation.finePrint}</p>
          <p className="fineprint dense">Route: {o.presentation.routeLegs.map((l) => `${l.label} ${l.minutes}m`).join(" → ")}</p>
        </>
      ) : (
        <>
          <Counter label="Commute, one way" value={o.commuteMinutes} format={(n) => `${Math.round(n)} min`} f={{ ...ILLUS, reference_period: "not a computed route" }} />
          <div className="small">
            Utilities: <b>{o.utilities.status === "unknown" ? "unknown" : "included"}</b> <ProvChip f={{ ...ILLUS, status: o.utilities.status }} />
          </div>
          {difficulty === "normal" && <p className="small">“{o.presentation.listingText}”</p>}
        </>
      )}
      <button className="btn" disabled={disabled} onClick={onPick}>
        Pick {letter} ▶
      </button>
    </article>
  );
}

/** Quick multiple-choice questions, each with a sourced teaching point (replaces the old viewing hunt). */
function QuestionSet({ questions, onWrong, onDone }: { questions: ViewingQuestion[]; onWrong: () => void; onDone: (right: number) => void }) {
  const { addPoints } = useShow();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState<string | null>(null);
  const q = questions[i];
  const a = q ? picked[q.id] : undefined;
  const right = questions.filter((x) => x.options.find((o) => o.id === picked[x.id])?.correct).length;
  useLifelines(
    q && !a
      ? {
          hint: () => setHidden(q.options.find((o) => !(o as { correct?: boolean }).correct)!.id),
          pass: () => (setPicked({ ...picked, [q.id]: "skip" }), void 0),
        }
      : {},
    [i, a],
  );
  useEffect(() => {
    if (!q) onDone(right);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!q) return null;
  if (a) {
    const ok = a === "skip" ? null : !!q.options.find((o) => o.id === a && (o as { correct?: boolean }).correct);
    return (
      <Reveal
        key={`${q.id}-r`}
        ok={ok}
        lines={a === "skip" ? ["Free Pass used."] : [ok ? q.feedback.right : q.feedback.wrong]}
        why={[q.contentId]}
        points={ok ? PTS.answer : 0}
        stat={`viewing:${q.id}`}
        onNext={() => (setI(i + 1), setReady(false), setHidden(null))}
      />
    );
  }
  return (
    <div className="beat" key={q.id}>
      <div className="beat-head">
        <span className="pixel small">
          Viewing check {i + 1} of {questions.length}
        </span>
      </div>
      <Host lines={[q.text]} onDone={() => setReady(true)} />
      <Choices
        disabled={!ready}
        options={q.options.map((o) => ({ id: o.id, label: o.label, hidden: o.id === hidden }))}
        onPick={(id) => {
          if (q.options.find((o) => o.id === id && (o as { correct?: boolean }).correct)) addPoints(PTS.answer);
          else onWrong();
          setPicked({ ...picked, [q.id]: id });
        }}
      />
    </div>
  );
}

/** First month: rent, burden, fare and hours, then the one unknown cost you might have missed. */
function MonthReveal({ stage, character, offer, terms, verify, onDone }: { stage: PlayableStage; character: Character; offer: Offer; terms?: NegotiatedTerms; verify: VerifyItemId[]; onDone: () => void }) {
  const [step, setStep] = useState<"month" | "surprise">("month");
  const [ready, setReady] = useState(false);
  const c = consequence({ character, stage, offerId: offer.id, revealed: step === "surprise", terms });
  const field = (label: string) => c.fields.find((f) => f.label.startsWith(label))!;
  const [statCard, toSurprise] = useStatGate(`choose:${offer.id}`, () => setStep("surprise"));
  const flagged = verify.includes(offer.reveal.id);

  const counters = (
    <div className="counters month">
      <Counter label={terms ? "Rent (negotiated)" : "Rent"} value={c.offer.rentCents} format={(n) => money(Math.round(n))} f={ILLUS} />
      <Counter label="Utilities" value={field("Utilities").value} format={(n) => money(Math.round(n))} f={field("Utilities")} />
      <Counter label={`Rent burden (${stage.income.basis} income)`} value={c.rentBurdenPct} format={(n) => `${n.toFixed(1)}%`} f={DERIVED} />
      <Counter label="TTC fare" value={c.fareCents} format={(n) => money(Math.round(n))} f={field("TTC fare")} />
      <Counter label="Commuting" value={c.commuteHours} format={(n) => `${Math.round(n)} h/mo`} f={DERIVED} />
    </div>
  );
  if (step === "month")
    return (
      <div className="beat">
        <Host lines={["Here's your first month.", "Money and time, kept separate."]} onDone={() => setReady(true)} />
        {counters}
        <div className="choices">
          <button className="btn big blue" disabled={!ready || !!statCard} onClick={toSurprise}>
            Reveal a surprise ▶
          </button>
        </div>
        {statCard}
      </div>
    );
  return (
    <div className="beat">
      {counters}
      <Reveal
        ok={flagged ? true : null}
        headline={offer.reveal.headline}
        lines={[...offer.reveal.lines, flagged ? "You flagged this one. Nice!" : "You didn't flag this. Now you know."]}
        whyExtra={<p>{offer.reveal.text}</p>}
        points={flagged ? PTS.answer : 0}
        stat="verify"
        onNext={onDone}
      />
    </div>
  );
}

// =====================================================================
// Paperwork (Extended)
function ApplyRound({ onWrong, onWalk, onDone }: { onWrong: () => void; onWalk: () => void; onDone: (docs: Record<string, boolean>, rivalDelta: number) => void }) {
  const { addPoints } = useShow();
  const [i, setI] = useState(0);
  const [docs, setDocs] = useState<Record<string, boolean>>({});
  const [last, setLast] = useState<{ ok: boolean; line: string } | null>(null);
  const [rival, setRival] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const d = J.apply.docs[i];
  useLifelines(d && !last ? { pass: () => (setDocs({ ...docs, [d.id]: !d.ok }), setLast({ ok: true, line: "Free Pass used." }), void 0) } : {}, [i, !!last]);

  if (d) {
    if (last)
      return (
        <div className="beat">
          <div className={`quick-verdict ${last.ok ? "good" : "bad"}`} role="status">
            <span className="pixel">{last.ok ? "✓ Good call" : "✗ Hmm"}</span>
            <p className="big-line">{last.line}</p>
          </div>
          <div className="reveal-actions">
            <Why ids={[d.contentId]} />
            <button className="btn big" autoFocus onClick={() => (setI(i + 1), setLast(null))}>
              Next ▶
            </button>
          </div>
        </div>
      );
    return (
      <div className="beat" key={d.id}>
        <Host lines={i === 0 ? ["What goes in your application folder?", `Item ${i + 1}: ${d.label}.`] : [`Item ${i + 1}: ${d.label}.`]} onDone={() => setReady(true)} />
        <Choices
          disabled={!ready}
          options={[
            { id: "bring", label: "📂 Bring it" },
            { id: "leave", label: "🚫 Leave it" },
          ]}
          onPick={(c) => {
            const bring = c === "bring";
            const ok = bring === d.ok;
            setDocs({ ...docs, [d.id]: bring });
            if (ok) addPoints(PTS.small);
            else onWrong();
            setReady(false);
            setLast({ ok, line: d.ok ? content(d.contentId).short : bring ? "Never hand that over." : "Right. Never hand that over." });
          }}
        />
      </div>
    );
  }

  if (rival) {
    const o = J.apply.rival.options.find((x) => x.id === rival)!;
    return (
      <Reveal
        ok={null}
        headline={o.id === "match" ? "Rent +$100" : o.id === "stick" ? "You got it!" : ""}
        lines={o.outcome as unknown as string[]}
        why={[J.apply.infoContentId]}
        stat="apply:rival"
        onNext={() => (o.id === "walk" ? onWalk() : onDone(docs, o.rentDeltaCents))}
        nextLabel={o.id === "walk" ? "Back to the places ▶" : "Next ▶"}
      />
    );
  }
  return (
    <div className="beat">
      <Host lines={["Your phone buzzes.", J.apply.rival.text]} onDone={() => setReady(true)} />
      <Choices disabled={!ready} options={J.apply.rival.options.map((o) => ({ id: o.id, label: o.label }))} onPick={setRival} />
    </div>
  );
}

// =====================================================================
// Haggle Time (Extended, optional; the only round that can call the LLM)
function NegotiateRound({ stageId, offer, difficulty, scripted, rivalDelta, onDone }: { stageId: string; offer: Offer; difficulty: Difficulty; scripted: boolean; rivalDelta: number; onDone: (t?: NegotiatedTerms) => void }) {
  const [mode, setMode] = useState<"ask" | "chat">("ask");
  const [ready, setReady] = useState(false);
  if (rivalDelta > 0)
    return (
      <div className="beat">
        <Host lines={[`You matched the other offer: ${money(offer.rentCents + rivalDelta)} a month.`, "The price is set. On to the lease!"]} onDone={() => setReady(true)} />
        <div className="choices">
          <button className="btn big" disabled={!ready} onClick={() => onDone(undefined)}>
            Read the lease ▶
          </button>
        </div>
      </div>
    );
  if (mode === "chat")
    return (
      <Negotiation
        stageId={stageId}
        offer={offer}
        difficulty={difficulty}
        scripted={scripted}
        onAccept={(t) => onDone(t.rentCents !== offer.rentCents || t.concessions.length ? t : undefined)}
        onWalk={() => onDone(undefined)}
      />
    );
  return (
    <div className="beat">
      <Host lines={[`It's listed at ${money(offer.rentCents)} a month.`, "Haggle, or take it as listed?"]} onDone={() => setReady(true)} />
      <Choices
        disabled={!ready}
        options={[
          { id: "chat", label: "💬 Haggle" },
          { id: "accept", label: "✓ Take it as listed" },
        ]}
        onPick={(c) => (c === "chat" ? setMode("chat") : onDone(undefined))}
      />
    </div>
  );
}

// =====================================================================
// Read the Fine Print (Extended, no timer)
function LeaseRound({ clauses, difficulty, onWrong, onDone }: { clauses: ReturnType<typeof leaseFor>; difficulty: Difficulty; onWrong: () => void; onDone: (r: Record<string, "problem" | "fine" | "skip">) => void }) {
  const { addPoints } = useShow();
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<Record<string, "problem" | "fine" | "skip">>({});
  const [magnified, setMagnified] = useState(false);
  const [ready, setReady] = useState(false);
  const c = clauses[i];
  const plain = c ? J.lease.clauses.find((x) => x.id === c.id)!.plain.replaceAll("{rent}", c.text.match(/\$[\d,]+/)?.[0] ?? "") : "";
  const a = c ? ans[c.id] : undefined;
  useLifelines(c && !a ? { ...(difficulty === "hard" ? { magnify: () => setMagnified(true) } : {}), pass: () => setAns({ ...ans, [c.id]: "skip" }) } : {}, [i, a]);
  useEffect(() => {
    setReady(difficulty === "hard");
    setMagnified(false);
  }, [i, difficulty]);

  if (!c) {
    const right = clauses.filter((x) => ans[x.id] === (x.problem ? "problem" : "fine")).length;
    return (
      <Reveal
        ok={right === clauses.filter((x) => ans[x.id] !== "skip").length}
        headline={`${right} of ${clauses.length} right`}
        lines={[content("lease-standard").short]}
        why={["lease-standard"]}
        onNext={() => onDone(ans)}
        nextLabel="Sign and move in ▶"
      />
    );
  }
  if (a) {
    const ok = a === "skip" ? null : (a === "problem") === c.problem;
    const lines = a === "skip" ? ["Free Pass used."] : c.problem ? [c.why ?? "This clause is a problem."] : ["This one's a normal clause.", ...(c.contentId ? [content(c.contentId).short] : [])];
    return <Reveal key={c.id} ok={ok} headline={c.problem ? "Problem clause" : "Fine"} lines={lines} why={c.contentId ? [c.contentId] : undefined} points={ok ? PTS.answer : 0} stat={`lease:${c.id}`} onNext={() => setI(i + 1)} />;
  }
  return (
    <div className="beat" key={c.id}>
      <div className="beat-head">
        <span className="pixel small">
          Clause {i + 1} of {clauses.length}
        </span>
      </div>
      <div className="lease-sheet">
        {difficulty === "hard" && !magnified ? <p className="fineprint dense">{c.text}</p> : <LinePlayer lines={[magnified ? plain : c.text]} onDone={() => setReady(true)} big />}
      </div>
      <Choices
        disabled={!ready}
        options={[
          { id: "fine", label: "👍 Fine" },
          { id: "problem", label: "🚩 Problem" },
        ]}
        onPick={(x) => {
          const ok = (x === "problem") === c.problem;
          if (ok) addPoints(PTS.answer);
          else onWrong();
          setAns({ ...ans, [c.id]: x as "problem" | "fine" });
        }}
      />
    </div>
  );
}

// =====================================================================
// Moving Day: one multiple-choice question earns the photos receipt; Extended adds insurance and the first-month reveal.
function MoveInRound(props: {
  stage: PlayableStage;
  character: Character;
  offer: Offer;
  terms?: NegotiatedTerms;
  verify: VerifyItemId[];
  /** Already answered in a Base game the player chose to skip; null means ask. */
  carriedPhotos: boolean | null;
  askInsurance: boolean;
  revealHere: boolean;
  onWrong: () => void;
  onDone: (photos: boolean, insured?: boolean) => void;
}) {
  const { stage, character, offer, terms, verify, carriedPhotos, askInsurance, revealHere, onWrong, onDone } = props;
  const askPhotos = carriedPhotos === null;
  const { addPoints } = useShow();
  const steps = [...(askPhotos ? ["photos", "photosDone"] : []), ...(askInsurance ? ["insurance", "insured"] : []), ...(revealHere ? ["month"] : []), "done"] as const;
  const [n, setN] = useState(0);
  const step = steps[n] as "photos" | "photosDone" | "insurance" | "insured" | "month" | "done";
  const [pick, setPick] = useState<string | null>(null);
  const [insured, setInsured] = useState<boolean | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const q = J.moveIn.question;
  const photos = askPhotos ? !!q.options.find((o) => o.id === pick && (o as { correct?: boolean }).correct) : carriedPhotos;
  const advance = () => (setReady(false), setN(n + 1));
  useEffect(() => {
    if (step === "done") onDone(photos, insured);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  if (step === "photos")
    return (
      <div className="beat">
        <Host lines={[q.text]} onDone={() => setReady(true)} />
        <Choices
          disabled={!ready}
          options={q.options.map((o) => ({ id: o.id, label: o.label }))}
          onPick={(id) => {
            setPick(id);
            if (q.options.find((o) => o.id === id && (o as { correct?: boolean }).correct)) addPoints(PTS.answer);
            else onWrong();
            advance();
          }}
        />
      </div>
    );
  if (step === "photosDone")
    return (
      <Reveal
        ok={photos}
        headline={photos ? "📷 Receipt earned" : "No photos"}
        lines={(q.feedback as Record<string, string[]>)[pick!]}
        why={[J.moveIn.contentId]}
        points={photos ? PTS.answer : 0}
        stat="movein"
        onNext={advance}
      />
    );
  if (step === "insurance")
    return (
      <div className="beat">
        <Host lines={["Contents insurance for your stuff?"]} onDone={() => setReady(true)} />
        <Choices
          disabled={!ready}
          options={[
            { id: "yes", label: "🛡 Yes, insure it" },
            { id: "no", label: "Skip it" },
          ]}
          onPick={(x) => (setInsured(x === "yes"), advance())}
        />
      </div>
    );
  if (step === "insured") return <Reveal ok={null} headline={insured ? "Insured" : "No insurance"} lines={[content(J.moveIn.insuranceContentId).short]} why={[J.moveIn.insuranceContentId]} onNext={advance} nextLabel="Your first month ▶" />;
  if (step === "month") return <MonthReveal stage={stage} character={character} offer={offer} terms={terms} verify={verify} onDone={advance} />;
  return null;
}

// =====================================================================
// Something Breaks / Life Happens
function LiveRound({ events, photos, insured, onWrong, onDone }: { events: JourneyEvent[]; photos: boolean; insured?: boolean; onWrong: () => void; onDone: (a: EventAns) => void }) {
  const { addPoints } = useShow();
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<EventAns>({});
  const [step, setStep] = useState<"action" | "actionReveal" | "level" | "levelReveal">("action");
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState<string | null>(null);
  const e = events[i];
  const a = e ? ans[e.id] ?? {} : {};
  useLifelines(
    e && (step === "action" || step === "level")
      ? {
          ...(step === "action" ? { hint: () => setHidden(e.actions.find((x) => !(x as { best?: boolean }).best)!.id) } : {}),
          pass: () => {
            setAns({ ...ans, [e.id]: { ...a, skipped: true } });
            setI(i + 1);
            setStep("action");
          },
        }
      : {},
    [i, step],
  );
  useEffect(() => {
    if (!e) onDone(ans);
  }, [e]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!e) return null;
  const levels = J.eventLevels as Level[];

  if (step === "action")
    return (
      <div className="beat" key={`${e.id}-a`}>
        <div className="beat-head">
          <span className="pixel small">{events.length > 1 ? `Event ${i + 1} of ${events.length}: ${e.title}` : e.title}</span>
        </div>
        <Host lines={[e.text, "What do you do?"]} onDone={() => setReady(true)} />
        <Choices
          disabled={!ready}
          options={e.actions.map((x) => ({ id: x.id, label: x.label, hidden: x.id === hidden }))}
          onPick={(id) => {
            if (isBest(e, id)) addPoints(PTS.answer);
            else onWrong();
            setAns({ ...ans, [e.id]: { ...a, action: id } });
            setStep("actionReveal");
            setReady(false);
            setHidden(null);
          }}
        />
      </div>
    );
  if (step === "actionReveal") {
    const best = isBest(e, a.action);
    const fb = (e.feedback as unknown as Record<string, string[]>)[a.action!] ?? [];
    // The move-in photos receipt changes how a damage event ends (PRD v3 Change 1, round 4).
    const photoLine = photoOutcome(e, photos);
    const ins = (e as { insurance?: boolean }).insurance && insured !== undefined ? (insured ? "🛡 Your contents insurance can cover the bag." : "No contents insurance: the bag's on you.") : null;
    const lines = [fb[0], photoLine, ins, fb[1]].filter((x): x is string => !!x).slice(0, 3);
    return (
      <Reveal
        key={`${e.id}-ar`}
        ok={best}
        headline={photoLine ? (photos ? "📷 Photos to the rescue" : "No photos") : undefined}
        lines={lines}
        why={[e.contentId, ...(photoLine ? [J.moveIn.contentId] : [])]}
        points={best ? PTS.answer : 0}
        stat={`event:${e.id}:action`}
        onNext={() => setStep("level")}
        nextLabel="Who fixes this? ▶"
      />
    );
  }
  if (step === "level")
    return (
      <div className="beat" key={`${e.id}-l`}>
        <Host lines={["If it isn't sorted, which level can act?"]} onDone={() => setReady(true)} />
        <Choices
          disabled={!ready}
          options={levels.map((lv) => ({ id: lv, label: J.levels[lv] }))}
          onPick={(lv) => {
            const ok = levelCorrect(e, lv as Level);
            if (ok) addPoints(PTS.answer);
            else onWrong();
            setAns({ ...ans, [e.id]: { ...a, level: lv as Level } });
            setStep("levelReveal");
            setReady(false);
          }}
        />
      </div>
    );
  const ok = levelCorrect(e, a.level!);
  return (
    <Reveal
      key={`${e.id}-lr`}
      ok={ok}
      headline={J.levels[e.level as Level]}
      lines={[e.levelWhy]}
      why={[e.contentId, ...((e as { extraContentIds?: string[] }).extraContentIds ?? [])]}
      points={ok ? PTS.answer : 0}
      stat={`event:${e.id}:level`}
      onNext={() => {
        setI(i + 1);
        setStep("action");
      }}
      nextLabel={i + 1 < events.length ? "Next event ▶" : "Next ▶"}
    />
  );
}

// =====================================================================
// Moving Out (Extended)
function MoveOutRound({ photos, seed, onWrong, onDone }: { photos: boolean; seed: number; onWrong: () => void; onDone: (notice: string) => void }) {
  const { addPoints } = useShow();
  const [notice, setNotice] = useState<string | null>(null);
  const [step, setStep] = useState<"notice" | "noticeReveal" | "dispute" | "deposit">("notice");
  const [ready, setReady] = useState(false);
  const defect = J.moveIn.defects.find((d) => d.id === disputedDefect(seed))!;
  useLifelines(step === "notice" ? { hint: () => setReady(true) } : {}, [step]);

  if (step === "notice")
    return (
      <div className="beat">
        <Host lines={["You're moving on.", "How do you give notice?"]} onDone={() => setReady(true)} />
        <Choices
          disabled={!ready}
          options={J.moveOut.options.map((o) => ({ id: o.id, label: o.label }))}
          onPick={(id) => {
            const ok = !!J.moveOut.options.find((o) => o.id === id && (o as { best?: boolean }).best);
            if (ok) addPoints(PTS.answer);
            else onWrong();
            setNotice(id);
            setStep("noticeReveal");
          }}
        />
      </div>
    );
  if (step === "noticeReveal") {
    const ok = !!J.moveOut.options.find((o) => o.id === notice && (o as { best?: boolean }).best);
    return <Reveal ok={ok} lines={(J.moveOut.feedback as unknown as Record<string, string[]>)[notice!]} why={[J.moveOut.contentId]} points={ok ? PTS.answer : 0} stat="moveout:notice" onNext={() => (setReady(false), setStep("dispute"))} nextLabel="Final walkthrough ▶" />;
  }
  if (step === "dispute")
    return (
      <Reveal
        ok={photos}
        headline={photos ? "Receipt saves the day!" : "Your word vs. theirs"}
        lines={[`Landlord: "That ${defect.label.toLowerCase()} wasn't there!"`, photos ? "You show your move-in photos. Dropped." : "Move-in photos would have settled it."]}
        why={[J.moveIn.contentId]}
        onNext={() => setStep("deposit")}
      />
    );
  return <Reveal ok={null} headline="Deposit" lines={[content(J.moveOut.depositContentId).short]} why={[J.moveOut.depositContentId]} onNext={() => onDone(notice!)} nextLabel="The report card ▶" />;
}

// =====================================================================
// Finale
function ReportRound(props: {
  stage: PlayableStage;
  character: Character;
  age: number;
  offer: Offer;
  terms?: NegotiatedTerms;
  difficulty: Difficulty;
  seed: number;
  mode: Mode;
  res: Results;
  events: JourneyEvent[];
  receipts: string[];
  onReplay: () => void;
  onQuit: () => void;
  onExtended: (carry: BaseCarry) => void;
}) {
  const { stage, character, age, offer, terms, difficulty, seed, mode, res, events, receipts, onReplay, onQuit, onExtended } = props;
  const { score, lifelines, addPoints } = useShow();
  const sfx = useSfx();
  const [step, setStep] = useState<"drum" | "card" | "civic">("drum");
  const [pickQ, setPickQ] = useState(0);
  const [copied, setCopied] = useState("");
  const bonusGiven = useRef(false);
  const unused = Object.values(lifelines).filter(Boolean).length;
  useEffect(() => {
    if (!bonusGiven.current) {
      bonusGiven.current = true;
      addPoints(unused * PTS.lifelineBonus);
    }
    sfx.fanfare();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const extended = mode === "extended";
  const c = consequence({ character, stage, offerId: offer.id, revealed: true, terms });
  const ev = evidenceFor(offer.neighbourhoodId);
  const evCounted = events.filter((e) => !res.events[e.id]?.skipped);
  const leaseClauses = leaseFor(offer.id, seed, terms?.rentCents ?? offer.rentCents, difficulty).filter((x) => res.lease[x.id] !== "skip");
  const result: JourneyResult = {
    scams: res.scams ?? { correct: 0, total: 0 },
    unknownCostFound: res.verify.includes(offer.reveal.id),
    photos: !!res.photos,
    events: {
      best: evCounted.filter((e) => isBest(e, res.events[e.id]?.action)).length,
      total: evCounted.length,
      levels: evCounted.filter((e) => res.events[e.id]?.level && levelCorrect(e, res.events[e.id]!.level!)).length,
    },
    ...(extended
      ? {
          scamReport: res.scamReport, // undefined when Spot the Fake was skipped after Base: not scored
          viewing: res.viewing,
          docs: { good: J.apply.docs.filter((d) => d.ok && res.docs[d.id] === true).length, bad: J.apply.docs.filter((d) => !d.ok && res.docs[d.id] === true).length },
          lease: { spotted: leaseClauses.filter((x) => x.problem && res.lease[x.id] === "problem").length, total: leaseClauses.filter((x) => x.problem).length, falseFlags: leaseClauses.filter((x) => !x.problem && res.lease[x.id] === "problem").length },
          notice: !!J.moveOut.options.find((o) => o.id === res.notice && (o as { best?: boolean }).best),
          insured: res.insured,
        }
      : {}),
    receipts,
  };
  const rc = reportCard(result);
  const notebook: DraftQuestion[] = (() => {
    const kinds = new Set(events.map((e) => (e as { civic?: string }).civic).filter(Boolean) as string[]);
    const qs: DraftQuestion[] = [];
    if (kinds.has("ttc")) qs.push(buildQuestion(stage, c, ev, "reliability"));
    if (kinds.has("heat")) qs.push(buildCityQuestion("heat", ev));
    if (kinds.has("repairs")) qs.push(buildCityQuestion("repairs", ev));
    if (!qs.length) qs.push(buildQuestion(stage, c, ev, "reliability"));
    return qs;
  })();
  const q = notebook[Math.min(pickQ, notebook.length - 1)];
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(what);
  }
  const toExtended = () => onExtended({ scams: result.scams, photos: result.photos, eventIds: events.map((e) => e.id) });

  if (step === "drum") return <Reveal ok={null} headline="The results are in…" lines={["Drumroll, please!"]} onNext={() => setStep("card")} nextLabel="Show me! ▶" />;

  if (step === "card")
    return (
      <section className="report-show">
        <Confetti />
        <div className="report-top">
          <div className="podium-sprite big">
            <Sprite appearance={character.appearance} scale={6} />
          </div>
          <div className="counters">
            <Counter label="Ready to rent" value={rc.readiness} format={(n) => `${Math.round(n)}%`} f={DERIVED} />
            <Counter label="Show score" value={score} format={(n) => `${Math.round(n)}`} f={DERIVED} />
          </div>
        </div>
        <p className="big-line">
          {character.name}, {age} · {MODES[mode].label} · {DIFFICULTY_INFO[difficulty].label} · seed {seed}
        </p>
        <div className="tiles">
          {rc.lines.map((l) => (
            <div key={l.label} className={`tile ${l.score >= 0.99 ? "full" : l.score < 0.5 ? "low" : ""}`}>
              <div className="tile-value pixel">{l.value.split(" (")[0]}</div>
              <div className="tile-label">{l.label}</div>
              <span className="sr-only">{Math.round(l.score * 100)} percent</span>
            </div>
          ))}
        </div>
        <div className="reveal-actions">
          <Why
            extra={
              <>
                <p>Scored on skill only: never income, neighbourhood, rent, insurance, or money-vs-commute choices.</p>
                <p>
                  Receipts: {receipts.length ? receipts.join(" · ") : "none"}. Lifelines unused: {unused} (+{unused * PTS.lifelineBonus}).
                </p>
              </>
            }
          />
          <button className="btn ghost" onClick={() => copy([`Rental readiness: ${rc.readiness}% · score ${score} (${MODES[mode].label}, ${DIFFICULTY_INFO[difficulty].label}, seed ${seed})`, ...rc.lines.map((l) => `- ${l.label}: ${l.value}`)].join("\n"), "report")}>
            📋 Copy report card
          </button>
          {copied === "report" && <span className="yes">Copied!</span>}
          <button className="btn big" onClick={() => setStep("civic")}>
            One more thing ▶
          </button>
        </div>
      </section>
    );

  return (
    <section className="beat">
      <Host lines={["Some of what went wrong is City business.", "Here's a question for municipal candidates."]} />
      {notebook.length > 1 && (
        <div className="choices">
          {notebook.map((x, n) => (
            <button key={x.stageId} className={`choice ${pickQ === n ? "on" : ""}`} onClick={() => setPickQ(n)} aria-pressed={pickQ === n}>
              {x.leverName}
            </button>
          ))}
        </div>
      )}
      <div className="question-card">
        <span className="draft-tag">Draft question · not an endorsement or prediction</span>
        <LinePlayer key={q.stageId} lines={q.short} big />
      </div>
      <div className="reveal-actions">
        <Why
          extra={
            <>
              <p>{q.text}</p>
              <ul className="cites">
                {q.citations.map((x) => (
                  <li key={x.label}>{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.label}</a> : x.label}</li>
                ))}
              </ul>
            </>
          }
        />
        <button className="btn green" onClick={() => copy(`${q.text}\n\nSources:\n${q.citations.map((x) => `- ${x.label}${x.url ? `: ${x.url}` : ""}`).join("\n")}`, "q")}>
          📋 Copy question + sources
        </button>
        <a className="btn blue" href={ELECTION_HUB.url} target="_blank" rel="noreferrer">
          Election hub ↗
        </a>
        {copied === "q" && <span className="yes">Copied!</span>}
      </div>
      <div className="choices">
        {!extended && (
          <button className="btn big" onClick={toExtended}>
            ▶ Play the Extended game
          </button>
        )}
        <button className={`btn ${extended ? "big" : "ghost"}`} onClick={onReplay}>
          {extended ? "▶ Play again (new seed)" : "Play Base again"}
        </button>
        <button className="btn ghost" onClick={onQuit}>
          Quit to title
        </button>
      </div>
    </section>
  );
}
