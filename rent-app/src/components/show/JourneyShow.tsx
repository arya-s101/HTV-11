"use client";

// The rental journey presented as a pixel-art game show (PRD v2 §5.10, PRD v3). Logic and data come from
// src/game/journey.ts and the mode config (src/config/modes.ts); this file only sequences beats:
// host lines → big choices → reveal → stat card → next.
import { Icon, type IconName } from "@/components/icons";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MODES, SKIPPABLE_AFTER_BASE, type Mode, type RoundId } from "@/config/modes";
import { ELECTION_HUB, evidenceFor, VERIFY_ITEMS } from "@/game/data";
import { belowBenchmark, content, disputedDefect, J, judgeListing, leaseFor, listingsFor, reportCard, type Flag, type JourneyResult, type Level, type Listing } from "@/game/journey";
import { levelCorrect, template, type PlannedQuestion, type QuestionTemplate, type RunPlan, type ScenarioMap } from "@/game/questions";
import type { Profile } from "@/game/profile";
import { fill } from "@/game/scenario";
import { tailorStage } from "@/game/tailor";
import { ProfileForm } from "../ProfileForm";
import { narrator, setNarratorSettings, useNarratorSettings, useNarratorSupported } from "@/narrator";
import { consequence, money } from "@/game/outcome";
import { buildCityQuestion, buildQuestion, type DraftQuestion } from "@/game/question";
import { DIFFICULTY_INFO, hagglePoints } from "@/game/score";
import type { Character } from "@/game/sprite";
import type { Difficulty, Field, NegotiatedTerms, Offer, PlayableStage, VerifyItemId } from "@/game/types";
import { Negotiation } from "../Negotiation";
import { Sprite } from "../pixel";
import { Choices, Confetti, Counter, Host, LinePlayer, ProvChip, Reveal, SHOW, SkipButton, TitleCard, Why } from "./primitives";
import { play, setAudioPrefs, useAudioPrefs } from "../audio";
import { useSettings, type TextSpeed } from "./settings";
import { StatRun, useStatGate } from "./StatCard";

const ILLUS = { status: "illustrative" as const, geography: "Fictional scenario", reference_period: "2026 dollars", source_url: null };
const DERIVED = { ...ILLUS, status: "derived" as const };
type LifelineId = "hint" | "magnify";
const PTS = SHOW.points;

/** Split text into on-screen lines at sentence ends. */
const sentences = (t: string) => t.match(/[^.!?]+[.!?]*["”]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [t];

// ---------- this game's questions: plan (code), scenarios (Gemini or reviewed fallback) ----------
interface RunCtxValue {
  plan: RunPlan;
  scenarios: ScenarioMap;
  /** Code-owned placeholder values, e.g. {work} and {place}. */
  values: Record<string, string>;
  /** What the player chose to tell us (PRD v4 Change 4); empty in the demo and in multiplayer. */
  profile: Profile;
}
const RunCtx = createContext<RunCtxValue | null>(null);
const useRun = () => useContext(RunCtx)!;
const planned = (plan: RunPlan, id: string): PlannedQuestion => plan.questions[id];
const isCorrect = (plan: RunPlan, id: string, pick?: string) => !!pick && !!plan.questions[id]?.options.find((o) => o.id === pick && o.correct);
const correctLabel = (plan: RunPlan, id: string) => plan.questions[id].options.find((o) => o.correct)!.label;
/** Reveal lines for a template answer: the reviewed teaching point, plus the right answer when it was missed. */
function answerLines(plan: RunPlan, id: string, pick: string): string[] {
  const t = template(id);
  const note = t.disclaimer ? [t.disclaimer] : [];
  if (pick === "skip") return [`Answer: ${correctLabel(plan, id)}.`, ...note];
  return isCorrect(plan, id, pick) ? [content(t.content_id).short, ...note] : [`Better: ${correctLabel(plan, id)}.`, content(t.content_id).short, ...note];
}
/** Wording written in a past Gemini call never contains a digit; repair events count as written-request receipts. */
const writesReceipt = (t: QuestionTemplate) => !["live-ttc", "live-rent-increase"].includes(t.content_id);

/** Multiplayer hooks: report progress to the room; show the room's panel at the end. */
export interface PartyHooks {
  onProgress: (p: { score: number; round: string; done: boolean }) => void;
  panel: React.ReactNode;
}

/** What a finished Base game hands to Extended, so the same player can skip what they already played. */
export interface BaseCarry {
  scams: { correct: number; total: number };
  photos: boolean;
  /** Question templates already played, so Extended draws different ones. */
  played: string[];
}

// ---------- show context: score, receipts, lifelines ----------
type Outcome = "correct" | "wrong" | "skipped";
interface ShowCtx {
  score: number;
  addPoints: (n: number) => void;
  /** Counts every graded answer for the report card (PRD v4 Change 3). */
  tally: Record<Outcome, number>;
  count: (o: Outcome) => void;
  /** A correct answer: points plus the tally. */
  right: (points: number) => void;
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

type EventAns = Record<string, { action?: string; level?: Level | "skip" }>;
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
  plan: RunPlan;
  scenarios: ScenarioMap;
  values: Record<string, string>;
  profile: Profile;
  onProfile: (p: Profile) => void;
  /** Multiplayer: the room is told the score and round as you play, and shown on the report card instead of replay buttons. */
  party?: PartyHooks;
  scriptedLandlord: boolean;
  onReplay: () => void;
  onQuit: () => void;
  onExtended: (carry: BaseCarry) => void;
}) {
  const run = useMemo(() => ({ plan: props.plan, scenarios: props.scenarios, values: props.values, profile: props.profile }), [props.plan, props.scenarios, props.values, props.profile]);
  return (
    <RunCtx.Provider value={run}>
      <StatRun>
        <Show {...props} />
      </StatRun>
    </RunCtx.Provider>
  );
}

function Show(props: Parameters<typeof JourneyShow>[0]) {
  const { stage, age, character, difficulty, seed, mode, carry, plan, scriptedLandlord, onReplay, onQuit, onExtended, party } = props;
  const cfg = MODES[mode];
  const [skipPlayed, setSkipPlayed] = useState(false);
  const rounds = cfg.rounds.filter((r) => !(skipPlayed && SKIPPABLE_AFTER_BASE.includes(r)));
  const [round, setRound] = useState<RoundId | "welcome">("welcome");
  const [intro, setIntro] = useState(true);
  const [score, setScore] = useState(0);
  const [bump, setBump] = useState<number | null>(null);
  const [lifelines, setLifelines] = useState<Record<LifelineId, boolean>>({ hint: true, magnify: true });
  const armed = useRef<Partial<Record<LifelineId, () => void>>>({});
  const [armedKeys, setArmedKeys] = useState<LifelineId[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [shake, setShake] = useState(false);
  const [tally, setTally] = useState<Record<Outcome, number>>({ correct: 0, wrong: 0, skipped: 0 });
  const count = useCallback((o: Outcome) => setTally((t) => ({ ...t, [o]: t[o] + 1 })), []);
  const { still } = useSettings();

  const listings = useMemo(() => listingsFor(stage, difficulty, seed, cfg.listings), [stage, difficulty, seed, cfg.listings]);
  const offers = useMemo(() => (cfg.offerIds ? stage.offers.filter((o) => cfg.offerIds!.includes(o.id)) : stage.offers), [stage, cfg.offerIds]);
  const events = plan.events;
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
      tally,
      count,
      right: (n) => {
        count("correct");
        addPoints(n);
      },
      lifelines,
      arm: (h) => {
        armed.current = h;
        setArmedKeys(Object.keys(h) as LifelineId[]);
      },
    }),
    [score, addPoints, tally, count, lifelines],
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
    count("wrong");
    if (still) return;
    setShake(true);
    setTimeout(() => setShake(false), 400);
  };

  useEffect(() => {
    party?.onProgress({ score, round, done: round === "report" });
  }, [score, round]); // eslint-disable-line react-hooks/exhaustive-deps

  const offer = res.offerId ? stage.offers.find((o) => o.id === res.offerId)! : null;
  const agreedTerms: NegotiatedTerms | undefined =
    res.terms ?? (offer && res.rivalDelta ? { rentCents: offer.rentCents + res.rivalDelta, askingCents: offer.rentCents, utilitiesIncluded: false, concessions: [] } : undefined);
  const reached = (r: RoundId) => round !== "welcome" && rounds.indexOf(round) >= rounds.indexOf(r) && rounds.includes(r);

  const receipts = [
    ...(res.photos ? ["Move-in photos"] : []),
    ...events.filter((id) => isCorrect(plan, id, res.events[id]?.action) && writesReceipt(template(id))).map((id) => `Written request: ${template(id).title}`),
    ...(cfg.rounds.includes("lease") && reached("movein") ? ["Signed lease"] : []),
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
            <Icon name="receipt" /> <span className="pixel">{receipts.length}</span>
            <span className="sr-only"> receipts</span>
          </div>
          <div className="lifelines" aria-label="Lifelines">
            {SHOW.lifelines.map((l) => {
              const id = l.id as LifelineId;
              const usable = lifelines[id] && armedKeys.includes(id);
              return (
                <button key={l.id} className={`lifeline ${lifelines[id] ? "" : "used"}`} disabled={!usable} onClick={() => triggerLifeline(id)} title={`${l.name}: ${l.help}${lifelines[id] ? "" : " (used)"}`} aria-label={`${l.name}: ${l.help}${lifelines[id] ? "" : " Already used."}`}>
                  <Icon name={l.icon as IconName} />
                  <span className="lifeline-name">{l.name}</span>
                </button>
              );
            })}
          </div>
          <div className="podium-actions">
            <button className="btn ghost small" onClick={() => (narrator().cancel(), setShowSettings(!showSettings))} aria-expanded={showSettings}>
              <Icon name="gear" /> Settings
            </button>
            <button className="btn ghost small" onClick={() => setShowProfile(true)} aria-haspopup="dialog">
              <Icon name="user" /> Profile
            </button>
            <button className="btn ghost small" onClick={onQuit}>
              Quit
            </button>
          </div>
          {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
          {showProfile && (
            <div className="why-overlay" onClick={() => setShowProfile(false)}>
              <div className="drawer profile-drawer" role="dialog" aria-modal="true" aria-label="Your profile" onClick={(e) => e.stopPropagation()}>
                <ProfileForm profile={props.profile} onChange={props.onProfile} onClear={() => props.onProfile({})} />
                <p className="note">Changes apply to numbers from the next screen on. Scenes already written stay as they are.</p>
                <button className="btn small" autoFocus onClick={() => setShowProfile(false)}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="round-strip" aria-label="Rounds">
          {rounds.map((r) => (
            <span key={r} className={`dot-round ${r === round ? "on" : reached(r) ? "done" : ""}`} title={titleFor(r).title}>
              {r === "report" ? <Icon name="star" label="Report card" /> : roundNo(r)}
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
                profile={props.profile}
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
                const counted = listings.filter((l) => l.answer !== "legit");
                const correct = counted.filter((l) => {
                  const f = flags[l.id];
                  return f && f !== "skip" && judgeListing(l.answer, f) !== "missed";
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
              questions={plan.viewing}
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
                // A better deal scores (same formula in single-player and multiplayer).
                if (terms) addPoints(hagglePoints(terms.askingCents, terms.rentCents));
                patch({ terms });
                after("negotiate");
              }}
            />
          )}
          {round === "lease" && !intro && offer && (
            <LeaseRound
              clauses={leaseFor(offer.id, seed, agreedTerms?.rentCents ?? offer.rentCents, difficulty, props.profile.pets ? ["no-pets"] : [])}
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
              questionId={plan.moveout}
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
              receipts={receipts}
              onReplay={onReplay}
              onQuit={onQuit}
              onExtended={onExtended}
              party={party}
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
      <SoundControls />
      <NarratorControls />
      {s.reducedMotion && <p className="small muted">Your device asks for reduced motion, so movement is replaced with fades.</p>}
      <button className="btn small" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

/** A quick on/off on the first screen, so screen-reader users can avoid double reading straight away. */
function ReadAloudToggle() {
  const supported = useNarratorSupported();
  const { on } = useNarratorSettings();
  if (!supported) return null;
  return (
    <label className="toggle read-aloud-toggle">
      <input type="checkbox" checked={on} onChange={(e) => setNarratorSettings({ on: e.target.checked })} /> Read questions aloud
    </label>
  );
}

/** Read-aloud settings (PRD v5); hidden when this browser can't speak. */
export function NarratorControls() {
  const supported = useNarratorSupported();
  const n = useNarratorSettings();
  if (!supported) return null;
  const voices = narrator().voices();
  return (
    <div className="sound-controls">
      <label className="toggle">
        <input type="checkbox" checked={n.on} onChange={(e) => setNarratorSettings({ on: e.target.checked })} /> Read aloud
      </label>
      <label className="toggle">
        <input type="checkbox" checked={n.readOptions} disabled={!n.on} onChange={(e) => setNarratorSettings({ readOptions: e.target.checked })} /> Read options
      </label>
      <label className="slider">
        <span>Voice</span>
        <select value={n.voice} disabled={!n.on} onChange={(e) => setNarratorSettings({ voice: e.target.value })} aria-label="Voice">
          <option value="">Automatic (Canadian English if available)</option>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
      </label>
      <div className="seg" aria-label="Speech speed">
        {(["slow", "normal", "fast"] as const).map((sp) => (
          <button key={sp} className={`choice ${n.speed === sp ? "on" : ""}`} aria-pressed={n.speed === sp} disabled={!n.on} onClick={() => setNarratorSettings({ speed: sp })}>
            {sp}
          </button>
        ))}
      </div>
      <button className="btn ghost small" disabled={!n.on} onClick={() => void narrator().sample()}>
        <Icon name="volume-3" /> Test voice
      </button>
    </div>
  );
}

/** Master mute plus music and effects volume; shared with the navbar and saved on this device. */
export function SoundControls() {
  const a = useAudioPrefs();
  return (
    <div className="sound-controls">
      <label className="toggle">
        <input type="checkbox" checked={!a.muted} onChange={(e) => setAudioPrefs({ muted: !e.target.checked })} /> Sound on
      </label>
      <label className="slider">
        <span>Music</span>
        <input type="range" min={0} max={100} value={Math.round(a.music * 100)} disabled={a.muted} onChange={(e) => setAudioPrefs({ music: Number(e.target.value) / 100 })} aria-label="Music volume" />
      </label>
      <label className="slider">
        <span>Effects</span>
        <input type="range" min={0} max={100} value={Math.round(a.sfx * 100)} disabled={a.muted} onChange={(e) => setAudioPrefs({ sfx: Number(e.target.value) / 100 })} onPointerUp={() => play("correct")} aria-label="Effects volume" />
      </label>
    </div>
  );
}

function WelcomeBeat({ character, difficulty, mode, carry, profile, onGo }: { character: Character; difficulty: Difficulty; mode: Mode; carry?: BaseCarry; profile: Profile; onGo: (skipPlayed: boolean) => void }) {
  const [ready, setReady] = useState(false);
  // Only what the player told us: pronouns as given, and a stated interest as light flavour.
  const who = `${character.name}${profile.pronouns ? ` (${profile.pronouns})` : ""}`;
  const fan = profile.interests?.length ? ` Big ${profile.interests[0].toLowerCase()} fan!` : "";
  const lines = carry
    ? ["Welcome back! This is the Extended game.", `${who} returns, same character.`, "Skip Spot the Fake, which you just played?"]
    : [SHOW.welcome[0], `Our contestant: ${who}.${fan}`, `${MODES[mode].label}, ${DIFFICULTY_INFO[difficulty].label}. I'm your host, ${SHOW.host.name}.`];
  return (
    <>
      <Host lines={lines} onDone={() => setReady(true)} />
      <ReadAloudToggle />
      <div className="choices">
        {carry ? (
          <>
            <button className="btn big" disabled={!ready} onClick={() => onGo(true)}>
              Skip played rounds <Icon name="chevron-right" />
            </button>
            <button className="btn ghost" disabled={!ready} onClick={() => onGo(false)}>
              Play everything
            </button>
          </>
        ) : (
          <button className="btn big" disabled={!ready} onClick={() => onGo(false)}>
            Start the show <Icon name="chevron-right" />
          </button>
        )}
      </div>
    </>
  );
}

// =====================================================================
/**
 * One reviewed multiple-choice question: scenario (Gemini or reviewed fallback, fixed once shown), the reviewed prompt,
 * reviewed options in this game's order, the hint lifeline (hides a wrong option) and Skip.
 */
function TemplateQuestion({ id, header, onWrong, onAnswer }: { id: string; header?: string; onWrong: () => void; onAnswer: (pick: string) => void }) {
  const { plan, scenarios, values } = useRun();
  const { right, count } = useShow();
  const q = planned(plan, id);
  const t = template(id);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState<string | null>(null);
  // Locked on first render, so a late-arriving Gemini scenario never swaps text under the player.
  const [scene] = useState(() => scenarios[id] ?? { scenario: q.fallback });
  const sceneLines = sentences(fill(scene.scenario, values)).slice(0, 2);
  const lines = [...(scene.host_line && sceneLines.length < 2 ? [fill(scene.host_line, values)] : []), ...sceneLines, t.prompt];
  useLifelines(ready ? { hint: () => setHidden(q.options.find((o) => !o.correct)!.id) } : {}, [ready, id]);
  return (
    <div className="beat" key={id}>
      {header && (
        <div className="beat-head">
          <span className="pixel small">{header}</span>
        </div>
      )}
      <Host lines={lines} onDone={() => setReady(true)} narrate={lines.length - 1} />
      <Choices
        disabled={!ready}
        narrate={{ lines: [t.prompt] }}
        options={q.options.map((o) => ({ id: o.id, label: o.label, hidden: o.id === hidden }))}
        onPick={(pick) => {
          if (isCorrect(plan, id, pick)) right(PTS.answer);
          else onWrong();
          onAnswer(pick);
        }}
        onSkip={() => {
          count("skipped");
          onAnswer("skip");
        }}
      />
    </div>
  );
}

// =====================================================================
// Spot the Fake
function SearchRound({ listings, difficulty, askReport, onWrong, onDone }: { listings: Listing[]; difficulty: Difficulty; askReport: boolean; onWrong: () => void; onDone: (flags: Record<string, Flag | "skip">, scamReport: boolean) => void }) {
  const { right, count } = useShow();
  const { plan } = useRun();
  const [i, setI] = useState(0);
  const [flags, setFlags] = useState<Record<string, Flag | "skip">>({});
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState(false);
  const [magnified, setMagnified] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const l = listings[i];
  const answer = l ? flags[l.id] : undefined;
  useLifelines(
    !l || answer
      ? {}
      : {
          hint: () => setHint(true),
          ...(difficulty === "hard" ? { magnify: () => setMagnified(true) } : {}),
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
    const id = plan.scamReport;
    return report ? (
      <Reveal
        ok={report === "skip" ? null : isCorrect(plan, id, report)}
        skipped={report === "skip"}
        lines={answerLines(plan, id, report)}
        why={[template(id).content_id]}
        points={isCorrect(plan, id, report) ? PTS.answer : 0}
        stat="scam-report"
        onNext={() => onDone(flags, isCorrect(plan, id, report))}
        nextLabel={<>Next round <Icon name="chevron-right" /></>}
      />
    ) : (
      <TemplateQuestion id={id} onWrong={onWrong} onAnswer={setReport} />
    );
  }

  if (answer) {
    const skipped = answer === "skip";
    const ok = skipped ? null : ["correct", "caught"].includes(judgeListing(l.answer, answer));
    const headline = l.answer === "scam" ? "It's a scam!" : l.answer === "suspicious" ? "Suspicious!" : "Legit!";
    const lines = skipped
      ? [`Answer: ${l.answer}${l.redFlags.length ? `. ${content(l.redFlags[0]).short}` : "."}`]
      : l.redFlags.length
        ? l.redFlags.slice(0, 3).map((id) => content(id).short)
        : ["Nothing odd: viewings offered, no money up front."];
    return <Reveal key={l.id} ok={ok} skipped={skipped} headline={headline} lines={lines} why={l.redFlags.length ? l.redFlags : undefined} points={ok ? PTS.answer : 0} stat={`listing:${l.answer}`} onNext={next} />;
  }

  return (
    <div className="beat" key={l.id}>
      <div className="beat-head">
        <span className="pixel small">
          Listing {i + 1} of {listings.length}
        </span>
      </div>
      <ListingCard
        l={l}
        hint={difficulty === "easy" || hint}
        body={
          difficulty === "hard" && !magnified ? (
            <>
              <p className="fineprint dense">{l.text}</p>
              {!ready && (
                <button className="btn small ghost" onClick={() => setReady(true)}>
                  I&apos;ve read it
                </button>
              )}
            </>
          ) : (
            <ListingText id={l.id} fallback={difficulty === "easy" ? l.text : undefined} rentCents={l.rentCents} onDone={() => setReady(true)} narrate />
          )
        }
      />
      <Choices
        disabled={!ready}
        options={LISTING_CHOICES}
        narrate={difficulty === "hard" && !magnified ? undefined : { lines: [`${l.title}. ${money(l.rentCents)} a month.`, "Legit, suspicious or scam?"] }}
        onPick={(f) => {
          const v = judgeListing(l.answer, f as Flag);
          if (v === "correct" || v === "caught") right(PTS.answer);
          else onWrong();
          setFlags({ ...flags, [l.id]: f as Flag });
        }}
        onSkip={() => (count("skipped"), setFlags({ ...flags, [l.id]: "skip" }))}
      />
    </div>
  );
}

/** A listing: illustrative label, title, the ad text, and the rent against the real CMHC area average. Shared with multiplayer. */
export function ListingCard({ l, body, hint }: { l: Listing; body: React.ReactNode; hint: boolean }) {
  const ev = evidenceFor(l.neighbourhoodId);
  const below = belowBenchmark(l.rentCents, l.benchmarkCents);
  return (
    <article className="listing-card">
      <div className="illus">Illustrative, not a real listing</div>
      <h3>
        {l.title} · {ev.name}
      </h3>
      {body}
      <div className="counters">
        <Counter label="Rent" value={l.rentCents} format={(n) => `${money(Math.round(n))}`} f={ILLUS} />
        <Counter label="Area average (CMHC)" value={l.benchmarkCents} format={(n) => `${money(Math.round(n))}`} f={ev.cmhcRent[l.cmhcBedroom]} />
        {hint && below !== null && (
          <Counter label={below >= 0 ? "Below average" : "Above average"} value={Math.abs(Math.round(below * 100))} format={(n) => `${Math.round(n)}%`} f={DERIVED} />
        )}
      </div>
    </article>
  );
}

/** The three verdict buttons for a listing, with pixel icons. Shared with multiplayer. */
export const LISTING_CHOICES = [
  { id: "legit", label: "Legit", icon: "check" as const },
  { id: "suspicious", label: "Suspicious", icon: "alert" as const },
  { id: "scam", label: "Scam", icon: "close" as const },
];

/**
 * Listing prose: a validated Gemini rewrite when one arrived, else this game's reviewed fallback (Easy keeps its plainer
 * wording). Code fills {rent}; the features that make it legit, suspicious or a scam were chosen by code.
 */
function ListingText({ id, fallback, rentCents, onDone, narrate }: { id: string; fallback?: string; rentCents: number; onDone: () => void; narrate?: boolean }) {
  const { plan, scenarios } = useRun();
  const [text] = useState(() => fill(scenarios[id]?.scenario ?? fallback ?? plan.prose[id] ?? "", { rent: money(rentCents) }));
  return <LinePlayer lines={sentences(text)} onDone={onDone} narrate={narrate} />;
}

// =====================================================================
// Pick Your Place: flag what to verify, choose a place, then (Extended) quick viewing questions,
// and (Base) the first-month reveal straight away.
function PickRound(props: {
  stage: PlayableStage;
  character: Character;
  offers: Offer[];
  difficulty: Difficulty;
  questions: string[];
  revealHere: boolean;
  onWrong: () => void;
  onDone: (offerId: string, verify: VerifyItemId[], viewing?: { right: number; total: number }) => void;
}) {
  const { stage, character, offers, difficulty, questions, revealHere, onWrong, onDone } = props;
  const { values, profile } = useRun();
  const tailored = useMemo(() => tailorStage(stage, profile), [stage, profile]);
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
              <Icon name={verify.includes(v.id) ? "checkbox-on" : "checkbox"} /> {v.label}
            </button>
          ))}
        </div>
        <div className="choices">
          <button className="btn big" disabled={!ready} onClick={() => (setReady(false), setStep("choose"))}>
            See the places <Icon name="chevron-right" />
          </button>
        </div>
        <div className="skip-row">
          <SkipButton disabled={!ready} onSkip={() => (setVerify([]), setReady(false), setStep("choose"))} />
        </div>
      </div>
    );

  if (step === "choose")
    return (
      <div className="beat">
        <Host
          lines={[
            `${offers.length === 2 ? "Two" : "Three"} places. Each trades money, time and unknowns.`,
            ...(values.place ? [`You want ${values.place} nearby: check the map before you pick.`] : []),
            "Which one do you take?",
          ]}
          onDone={() => setReady(true)}
        />
        <div className={`doors n${offers.length}`}>
          {offers.map((o, n) => (
            <DoorCard
              key={o.id}
              o={tailored.stage.offers.find((x) => x.id === o.id)!}
              commuteField={tailored.tailoring.commute?.field}
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

function DoorCard({ o, letter, difficulty, decoded, commuteField, onPick, disabled }: { o: Offer; letter: string; difficulty: Difficulty; decoded: boolean; commuteField?: Omit<Field<number>, "value">; onPick: () => void; disabled: boolean }) {
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
      {difficulty === "hard" && !decoded && !commuteField ? (
        <>
          <p className="fineprint dense">{o.presentation.finePrint}</p>
          <p className="fineprint dense">Route: {o.presentation.routeLegs.map((l) => `${l.label} ${l.minutes}m`).join(" → ")}</p>
        </>
      ) : (
        <>
          <Counter label="Commute, one way" value={o.commuteMinutes} format={(n) => `${Math.round(n)} min`} f={commuteField ?? { ...ILLUS, reference_period: "not a computed route" }} />
          <div className="small">
            Utilities: <b>{o.utilities.status === "unknown" ? "unknown" : "included"}</b> <ProvChip f={{ ...ILLUS, status: o.utilities.status }} />
          </div>
          {difficulty !== "hard" && <OfferBlurb o={o} />}
        </>
      )}
      <button className="btn" disabled={disabled} onClick={onPick}>
        Pick {letter} <Icon name="chevron-right" />
      </button>
    </article>
  );
}

function OfferBlurb({ o }: { o: Offer }) {
  const { plan, scenarios } = useRun();
  const [text] = useState(() => fill(scenarios[o.id]?.scenario ?? plan.prose[o.id] ?? o.presentation.listingText, { rent: money(o.rentCents) }));
  return <p className="small">“{text}”</p>;
}

/** Quick multiple-choice questions, each with a sourced teaching point (replaces the old viewing hunt). */
function QuestionSet({ questions, onWrong, onDone }: { questions: string[]; onWrong: () => void; onDone: (right: number) => void }) {
  const { plan } = useRun();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const id = questions[i];
  const a = id ? picked[id] : undefined;
  const rightCount = questions.filter((q) => isCorrect(plan, q, picked[q])).length;
  useEffect(() => {
    if (!id) onDone(rightCount);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!id) return null;
  if (a)
    return (
      <Reveal
        key={`${id}-r`}
        ok={a === "skip" ? null : isCorrect(plan, id, a)}
        skipped={a === "skip"}
        lines={answerLines(plan, id, a)}
        why={[template(id).content_id]}
        points={isCorrect(plan, id, a) ? PTS.answer : 0}
        stat={`viewing:${id}`}
        onNext={() => setI(i + 1)}
      />
    );
  return <TemplateQuestion key={id} id={id} header={`Viewing check ${i + 1} of ${questions.length}`} onWrong={onWrong} onAnswer={(pick) => setPicked({ ...picked, [id]: pick })} />;
}

/** First month: rent, burden, fare and hours, then the one unknown cost you might have missed. */
function MonthReveal({ stage, character, offer, terms, verify, onDone }: { stage: PlayableStage; character: Character; offer: Offer; terms?: NegotiatedTerms; verify: VerifyItemId[]; onDone: () => void }) {
  const [step, setStep] = useState<"month" | "surprise">("month");
  const [ready, setReady] = useState(false);
  const { profile } = useRun();
  const c = consequence({ character, stage, offerId: offer.id, revealed: step === "surprise", terms, profile });
  const incomeField = c.fields.find((f) => f.label.startsWith("Monthly income"))!;
  const field = (label: string) => c.fields.find((f) => f.label.startsWith(label))!;
  const [statCard, toSurprise] = useStatGate(`choose:${offer.id}`, () => setStep("surprise"));
  const flagged = verify.includes(offer.reveal.id);
  const { right } = useShow();
  const awarded = useRef(false);
  useEffect(() => {
    // Flagging the hidden cost before choosing earns the points the reveal shows.
    if (step === "surprise" && flagged && !awarded.current) {
      awarded.current = true;
      right(PTS.answer);
    }
  }, [step, flagged, right]);

  const counters = (
    <div className="counters month">
      <Counter label={terms ? "Rent (negotiated)" : "Rent"} value={c.offer.rentCents} format={(n) => money(Math.round(n))} f={ILLUS} />
      <Counter label="Utilities" value={field("Utilities").value} format={(n) => money(Math.round(n))} f={field("Utilities")} />
      <Counter label={`Rent burden (${incomeField.status === "player_input" ? "your income" : "illustrative income"})`} value={c.rentBurdenPct} format={(n) => `${n.toFixed(1)}%`} f={DERIVED} />
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
            Reveal a surprise <Icon name="chevron-right" />
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
  const { right, count } = useShow();
  const [i, setI] = useState(0);
  const [docs, setDocs] = useState<Record<string, boolean>>({});
  const [last, setLast] = useState<{ ok: boolean | null; line: string } | null>(null);
  const [rival, setRival] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const d = J.apply.docs[i];

  if (d) {
    if (last)
      return (
        <div className="beat">
          <div className={`quick-verdict ${last.ok === null ? "" : last.ok ? "good" : "bad"}`} role="status">
            <span className="pixel"><Icon name={last.ok === null ? "next" : last.ok ? "check" : "close"} /> {last.ok === null ? "Skipped" : last.ok ? "Good call" : "Hmm"}</span>
            <p className="big-line">{last.line}</p>
          </div>
          <div className="reveal-actions">
            <Why ids={[d.contentId]} />
            <button className="btn big" autoFocus onClick={() => (setI(i + 1), setLast(null))}>
              Next <Icon name="chevron-right" />
            </button>
          </div>
        </div>
      );
    return (
      <div className="beat" key={d.id}>
        <Host lines={i === 0 ? ["What goes in your application folder?", `Item ${i + 1}: ${d.label}.`] : [`Item ${i + 1}: ${d.label}.`]} onDone={() => setReady(true)} narrate={i === 0 ? 1 : 0} />
        <Choices
          disabled={!ready}
          narrate={{ lines: [`Item ${i + 1}: ${d.label}.`] }}
          options={[
            { id: "bring", label: "Bring it", icon: "folder" },
            { id: "leave", label: "Leave it", icon: "cancel" },
          ]}
          onPick={(c) => {
            const bring = c === "bring";
            const ok = bring === d.ok;
            setDocs({ ...docs, [d.id]: bring });
            if (ok) right(PTS.small);
            else onWrong();
            setReady(false);
            setLast({ ok, line: d.ok ? content(d.contentId).short : bring ? "Never hand that over." : "Right. Never hand that over." });
          }}
          onSkip={() => {
            count("skipped");
            setReady(false);
            setLast({ ok: null, line: `Answer: ${d.ok ? "bring it" : "leave it"}. ${d.ok ? content(d.contentId).short : "Never hand that over."}` });
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
        nextLabel={o.id === "walk" ? <>Back to the places <Icon name="chevron-right" /></> : <>Next <Icon name="chevron-right" /></>}
      />
    );
  }
  return (
    <div className="beat">
      <Host lines={["Your phone buzzes.", J.apply.rival.text]} onDone={() => setReady(true)} />
      <Choices disabled={!ready} options={J.apply.rival.options.map((o) => ({ id: o.id, label: o.label }))} onPick={setRival} onSkip={() => setRival("stick")} />
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
            Read the lease <Icon name="chevron-right" />
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
          { id: "chat", label: "Haggle", icon: "message" },
          { id: "accept", label: "Take it as listed", icon: "check" },
        ]}
        onPick={(c) => (c === "chat" ? setMode("chat") : onDone(undefined))}
      />
    </div>
  );
}

// =====================================================================
// Read the Fine Print (Extended)
function LeaseRound({ clauses, difficulty, onWrong, onDone }: { clauses: ReturnType<typeof leaseFor>; difficulty: Difficulty; onWrong: () => void; onDone: (r: Record<string, "problem" | "fine" | "skip">) => void }) {
  const { right, count } = useShow();
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<Record<string, "problem" | "fine" | "skip">>({});
  const [magnified, setMagnified] = useState(false);
  const [ready, setReady] = useState(false);
  const c = clauses[i];
  const plain = c ? J.lease.clauses.find((x) => x.id === c.id)!.plain.replaceAll("{rent}", c.text.match(/\$[\d,]+/)?.[0] ?? "") : "";
  const a = c ? ans[c.id] : undefined;
  useLifelines(c && !a && difficulty === "hard" ? { magnify: () => setMagnified(true) } : {}, [i, a]);
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
        nextLabel={<>Sign and move in <Icon name="chevron-right" /></>}
      />
    );
  }
  if (a) {
    const ok = a === "skip" ? null : (a === "problem") === c.problem;
    const lines = a === "skip" ? [`Answer: ${c.problem ? `problem. ${c.why ?? ""}` : "fine, a normal clause."}`] : c.problem ? [c.why ?? "This clause is a problem."] : ["This one's a normal clause.", ...(c.contentId ? [content(c.contentId).short] : [])];
    return <Reveal key={c.id} ok={ok} skipped={a === "skip"} headline={c.problem ? "Problem clause" : "Fine"} lines={lines} why={c.contentId ? [c.contentId] : undefined} points={ok ? PTS.answer : 0} stat={`lease:${c.id}`} onNext={() => setI(i + 1)} />;
  }
  return (
    <div className="beat" key={c.id}>
      <div className="beat-head">
        <span className="pixel small">
          Clause {i + 1} of {clauses.length}
        </span>
      </div>
      <div className="lease-sheet">
        {difficulty === "hard" && !magnified ? <p className="fineprint dense">{c.text}</p> : <LinePlayer lines={[magnified ? plain : c.text]} onDone={() => setReady(true)} big narrate />}
      </div>
      <Choices
        disabled={!ready}
        narrate={difficulty === "hard" && !magnified ? undefined : { lines: [magnified ? plain : c.text] }}
        options={[
          { id: "fine", label: "Fine", icon: "thumbs-up" },
          { id: "problem", label: "Problem", icon: "flag" },
        ]}
        onPick={(x) => {
          const ok = (x === "problem") === c.problem;
          if (ok) right(PTS.answer);
          else onWrong();
          setAns({ ...ans, [c.id]: x as "problem" | "fine" });
        }}
        onSkip={() => (count("skipped"), setAns({ ...ans, [c.id]: "skip" }))}
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
  const { plan } = useRun();
  const steps = [...(askPhotos ? ["photos", "photosDone"] : []), ...(askInsurance ? ["insurance", "insured"] : []), ...(revealHere ? ["month"] : []), "done"] as const;
  const [n, setN] = useState(0);
  const step = steps[n] as "photos" | "photosDone" | "insurance" | "insured" | "month" | "done";
  const [pick, setPick] = useState<string | null>(null);
  const [insured, setInsured] = useState<boolean | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const qid = plan.movein;
  // The receipt comes only from picking the reviewed correct answer; skipping earns none.
  const photos = askPhotos ? isCorrect(plan, qid, pick ?? undefined) : carriedPhotos;
  const advance = () => (setReady(false), setN(n + 1));
  useEffect(() => {
    if (step === "done") onDone(photos, insured);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  if (step === "photos") return <TemplateQuestion id={qid} onWrong={onWrong} onAnswer={(p) => (setPick(p), advance())} />;
  if (step === "photosDone")
    return (
      <Reveal
        ok={pick === "skip" ? null : photos}
        skipped={pick === "skip"}
        headline={photos ? <><Icon name="camera" /> Receipt earned</> : "No photos"}
        lines={pick === "skip" ? [`Answer: ${correctLabel(plan, qid)}. No receipt.`] : answerLines(plan, qid, pick!)}
        why={[template(qid).content_id]}
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
            { id: "yes", label: "Yes, insure it", icon: "shield" },
            { id: "no", label: "Skip it" },
          ]}
          onPick={(x) => (setInsured(x === "yes"), advance())}
        />
      </div>
    );
  if (step === "insured") return <Reveal ok={null} headline={insured ? "Insured" : "No insurance"} lines={[content(J.moveIn.insuranceContentId).short]} why={[J.moveIn.insuranceContentId]} onNext={advance} nextLabel={<>Your first month <Icon name="chevron-right" /></>} />;
  if (step === "month") return <MonthReveal stage={stage} character={character} offer={offer} terms={terms} verify={verify} onDone={advance} />;
  return null;
}

// =====================================================================
// Something Breaks / Life Happens
function LiveRound({ events, photos, insured, onWrong, onDone }: { events: string[]; photos: boolean; insured?: boolean; onWrong: () => void; onDone: (a: EventAns) => void }) {
  const { plan } = useRun();
  const { right, count } = useShow();
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<EventAns>({});
  const [step, setStep] = useState<"action" | "actionReveal" | "level" | "levelReveal">("action");
  const [ready, setReady] = useState(false);
  const id = events[i];
  const t = id ? template(id) : null;
  const a = id ? (ans[id] ?? {}) : {};
  useEffect(() => {
    if (!id) onDone(ans);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!id || !t) return null;
  const levels = J.eventLevels as Level[];

  if (step === "action")
    return (
      <TemplateQuestion
        key={`${id}-a`}
        id={id}
        header={events.length > 1 ? `Event ${i + 1} of ${events.length}: ${t.title}` : t.title}
        onWrong={onWrong}
        onAnswer={(pick) => {
          setAns({ ...ans, [id]: { ...a, action: pick } });
          setStep("actionReveal");
        }}
      />
    );
  if (step === "actionReveal") {
    const skipped = a.action === "skip";
    const best = isCorrect(plan, id, a.action);
    // The move-in photos receipt changes how a damage event ends (PRD v3 Change 1, round 4); skipping doesn't avoid it.
    const photoLine = t.photos_matter ? (photos ? t.photos_matter.with : t.photos_matter.without) : null;
    const ins = t.insurance && insured !== undefined ? (insured ? "Your contents insurance can cover your things." : "No contents insurance: the damage to your things is on you.") : null;
    const [first, ...rest] = answerLines(plan, id, a.action!);
    const lines = [first, photoLine, ins, ...rest].filter((x): x is string => !!x).slice(0, 3);
    return (
      <Reveal
        key={`${id}-ar`}
        ok={skipped ? null : best}
        skipped={skipped}
        headline={photoLine ? (photos ? <><Icon name="camera" /> Photos to the rescue</> : "No photos") : undefined}
        lines={lines}
        why={[t.content_id, ...(photoLine ? [J.moveIn.contentId] : [])]}
        points={best ? PTS.answer : 0}
        stat={`event:${id}:action`}
        onNext={() => (setReady(false), setStep("level"))}
        nextLabel={<>Who fixes this? <Icon name="chevron-right" /></>}
      />
    );
  }
  if (step === "level")
    return (
      <div className="beat" key={`${id}-l`}>
        <Host lines={["If it isn't sorted, which level can act?"]} onDone={() => setReady(true)} narrate />
        <Choices
          disabled={!ready}
          narrate={{ lines: ["If it isn't sorted, which level can act?"] }}
          options={levels.map((lv) => ({ id: lv, label: J.levels[lv] }))}
          onPick={(lv) => {
            if (levelCorrect(t, lv)) right(PTS.answer);
            else onWrong();
            setAns({ ...ans, [id]: { ...a, level: lv as Level } });
            setStep("levelReveal");
          }}
          onSkip={() => {
            count("skipped");
            setAns({ ...ans, [id]: { ...a, level: "skip" } });
            setStep("levelReveal");
          }}
        />
      </div>
    );
  const levelSkipped = a.level === "skip";
  const ok = !levelSkipped && levelCorrect(t, a.level as string);
  return (
    <Reveal
      key={`${id}-lr`}
      ok={levelSkipped ? null : ok}
      skipped={levelSkipped}
      headline={J.levels[t.level as Level]}
      lines={levelSkipped ? [`Answer: ${J.levels[t.level as Level]}. ${t.level_why}`] : [t.level_why!]}
      why={[t.content_id, ...(t.extra_content_ids ?? [])]}
      points={ok ? PTS.answer : 0}
      stat={`event:${id}:level`}
      onNext={() => {
        setI(i + 1);
        setStep("action");
      }}
      nextLabel={i + 1 < events.length ? <>Next event <Icon name="chevron-right" /></> : <>Next <Icon name="chevron-right" /></>}
    />
  );
}

// =====================================================================
// Moving Out (Extended)
function MoveOutRound({ photos, seed, questionId, onWrong, onDone }: { photos: boolean; seed: number; questionId: string; onWrong: () => void; onDone: (notice: string) => void }) {
  const { plan } = useRun();
  const [notice, setNotice] = useState<string | null>(null);
  const [step, setStep] = useState<"notice" | "noticeReveal" | "dispute" | "deposit">("notice");
  const defect = J.moveIn.defects.find((d) => d.id === disputedDefect(seed))!;

  if (step === "notice") return <TemplateQuestion id={questionId} onWrong={onWrong} onAnswer={(p) => (setNotice(p), setStep("noticeReveal"))} />;
  if (step === "noticeReveal") {
    const skipped = notice === "skip";
    const ok = isCorrect(plan, questionId, notice ?? undefined);
    return <Reveal ok={skipped ? null : ok} skipped={skipped} lines={answerLines(plan, questionId, notice!)} why={[template(questionId).content_id]} points={ok ? PTS.answer : 0} stat="moveout:notice" onNext={() => setStep("dispute")} nextLabel={<>Final walkthrough <Icon name="chevron-right" /></>} />;
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
  return <Reveal ok={null} headline="Deposit" lines={[content(J.moveOut.depositContentId).short]} why={[J.moveOut.depositContentId]} onNext={() => onDone(notice!)} nextLabel={<>The report card <Icon name="chevron-right" /></>} />;
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
  receipts: string[];
  onReplay: () => void;
  onQuit: () => void;
  onExtended: (carry: BaseCarry) => void;
  party?: PartyHooks;
}) {
  const { stage, character, age, offer, terms, difficulty, seed, mode, res, receipts, onReplay, onQuit, onExtended, party } = props;
  const { plan } = useRun();
  const events = plan.events;
  const { score, lifelines, addPoints, tally } = useShow();
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
    play("report");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const extended = mode === "extended";
  const c = consequence({ character, stage, offerId: offer.id, revealed: true, terms, profile: useRun().profile });
  const ev = evidenceFor(offer.neighbourhoodId);
  const evCounted = events;
  const leaseClauses = leaseFor(offer.id, seed, terms?.rentCents ?? offer.rentCents, difficulty).filter((x) => res.lease[x.id] !== "skip");
  const result: JourneyResult = {
    scams: res.scams ?? { correct: 0, total: 0 },
    unknownCostFound: res.verify.includes(offer.reveal.id),
    photos: !!res.photos,
    events: {
      best: evCounted.filter((id) => isCorrect(plan, id, res.events[id]?.action)).length,
      total: evCounted.length,
      levels: evCounted.filter((id) => {
        const lv = res.events[id]?.level;
        return lv && lv !== "skip" && levelCorrect(template(id), lv);
      }).length,
    },
    ...(extended
      ? {
          scamReport: res.scamReport, // undefined when Spot the Fake was skipped after Base: not scored
          viewing: res.viewing,
          docs: { good: J.apply.docs.filter((d) => d.ok && res.docs[d.id] === true).length, bad: J.apply.docs.filter((d) => !d.ok && res.docs[d.id] === true).length },
          lease: { spotted: leaseClauses.filter((x) => x.problem && res.lease[x.id] === "problem").length, total: leaseClauses.filter((x) => x.problem).length, falseFlags: leaseClauses.filter((x) => !x.problem && res.lease[x.id] === "problem").length },
          notice: isCorrect(plan, plan.moveout, res.notice ?? undefined),
          insured: res.insured,
        }
      : {}),
    receipts,
  };
  const rc = reportCard(result);
  const notebook: DraftQuestion[] = (() => {
    const kinds = new Set(events.map((id) => template(id).civic).filter(Boolean) as string[]);
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
  const toExtended = () => onExtended({ scams: result.scams, photos: result.photos, played: Object.keys(plan.questions) });

  if (step === "drum") return <Reveal ok={null} headline="The results are in…" lines={["Drumroll, please!"]} onNext={() => setStep("card")} nextLabel={<>Show me! <Icon name="chevron-right" /></>} />;

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
        <div className="tally" aria-label="Answers">
          <span className="good"><Icon name="check" /> {tally.correct} correct</span>
          <span className="bad"><Icon name="close" /> {tally.wrong} wrong</span>
          <span><Icon name="next" /> {tally.skipped} skipped</span>
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
          <button className="btn ghost" onClick={() => copy([`Rental readiness: ${rc.readiness}% · score ${score} (${MODES[mode].label}, ${DIFFICULTY_INFO[difficulty].label}, seed ${seed})`, `Answers: ${tally.correct} correct, ${tally.wrong} wrong, ${tally.skipped} skipped`, ...rc.lines.map((l) => `- ${l.label}: ${l.value}`)].join("\n"), "report")}>
            <Icon name="clipboard" /> Copy report card
          </button>
          {copied === "report" && <span className="yes">Copied!</span>}
          <button className="btn big" onClick={() => setStep("civic")}>
            One more thing <Icon name="chevron-right" />
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
          <Icon name="clipboard" /> Copy question + sources
        </button>
        <a className="btn blue" href={ELECTION_HUB.url} target="_blank" rel="noreferrer">
          Election hub <Icon name="external-link" />
        </a>
        {copied === "q" && <span className="yes">Copied!</span>}
      </div>
      {party ? (
        party.panel
      ) : (
      <div className="choices">
        {!extended && (
          <button className="btn big" onClick={toExtended}>
            <Icon name="play" /> Play the Extended game
          </button>
        )}
        <button className={`btn ${extended ? "big" : "ghost"}`} onClick={onReplay}>
          {extended ? <><Icon name="play" /> Play again (new seed)</> : "Play Base again"}
        </button>
        <button className="btn ghost" onClick={onQuit}>
          Quit to title
        </button>
      </div>
      )}
    </section>
  );
}
