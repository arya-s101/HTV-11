"use client";

import { Icon } from "@/components/icons";
import { useEffect, useRef, useState } from "react";
import { Legend, Sprite, TitleScene } from "@/components/pixel";
import { play } from "@/components/audio";
import { Multiplayer } from "@/components/Multiplayer";
import { multiplayerEnabled } from "@/multiplayer/firebase";
import { JourneyShow, type BaseCarry } from "@/components/show/JourneyShow";
import { ShowSettingsProvider } from "@/components/show/settings";
import { ScoreBox, StageView, type StageRecord } from "@/components/StageView";
import { MODES, type Mode } from "@/config/modes";
import { prefetchScenarios, batchesFor } from "@/components/show/scenarios";
import { DEMO_SEED, listingsFor, newSeed } from "@/game/journey";
import Link from "next/link";
import { loadCharacter, loadDifficulty } from "@/game/character-store";
import { DifficultyPicker } from "@/components/CharacterCreator";
import { loadProfile, saveProfile, scenarioProfile, WORKPLACES, type Profile } from "@/game/profile";
import { loadRecent, planIds, planRun, rememberGame, type RunPlan, type ScenarioMap } from "@/game/questions";
import { ELECTION_HUB, STAGES } from "@/game/data";
import { money } from "@/game/outcome";
import { DEFAULT_AGE, planLife, type LifePlan } from "@/game/life";
import { DIFFICULTY_INFO } from "@/game/score";
import type { Difficulty, PlayableStage } from "@/game/types";
import { DEMO_CHARACTER, type Character } from "@/game/sprite";

type Screen = "title" | "create" | "stage" | "between" | "end" | "party";

const JOURNEY_STAGE = STAGES.find((s) => s.journey)! as PlayableStage;

/** Code-owned values for scenario placeholders: only what the player chose to tell us. */
function scenarioValues(p: Profile): Record<string, string> {
  return {
    work: p.workplace ? WORKPLACES.find((w) => w.id === p.workplace)!.label.replace(/ \(.*\)$/, "") : "work",
    place: p.nearbyOther ?? p.nearby?.[0]?.replace(/^A |^My /, "").toLowerCase() ?? "",
  };
}

export default function Game() {
  const [screen, setScreen] = useState<Screen>("title");
  const [character, setCharacter] = useState<Character>({ ...DEMO_CHARACTER, name: "", startAge: DEFAULT_AGE });
  const [plan, setPlan] = useState<LifePlan | null>(null);
  const [index, setIndex] = useState(0);
  const [records, setRecords] = useState<StageRecord[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [demo, setDemo] = useState(false);
  const [seed, setSeed] = useState(DEMO_SEED);
  const [mode, setMode] = useState<Mode>("base");
  const [carry, setCarry] = useState<BaseCarry | undefined>(undefined);
  // This game's questions (PRD v4 Change 2): planned by code from the seed; scenarios arrive in the background.
  const [run, setRun] = useState<RunPlan>(() => planRun(DEMO_SEED, "base"));
  const [scenarios, setScenarios] = useState<ScenarioMap>({});
  const [profile, setProfile] = useState<Profile>({});
  const runToken = useRef(0);
  const fetchedFor = useRef("");
  // The character is made on /character and shared by single-player and multiplayer games.
  const [saved, setSaved] = useState<Character | null>(null);
  useEffect(() => {
    const c = loadCharacter();
    const p = loadProfile();
    setSaved(c);
    setProfile(p);
    setDifficulty(loadDifficulty());
    if (c) setCharacter(c);
    const s = newSeed();
    setSeed(s);
    // Coming back from the character page with "Play", "Extended" or "Multiplayer"; otherwise plan the next Base
    // game now, so its scenes are ready by round 1.
    const next = new URLSearchParams(window.location.search).get("play");
    if (c && (next === "base" || next === "extended" || next === "party")) {
      window.history.replaceState(null, "", "/");
      startGame(next, c, s, p);
    } else prepare("base", s, { character: c ?? character, profile: p });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Starts a game with the saved character; without one, the character page comes first. */
  function startGame(choice: Mode | "party", c: Character | null = saved, s0?: number, p: Profile = profile) {
    if (!c) {
      window.location.href = "/character";
      return;
    }
    if (choice === "party") {
      setScreen("party");
      top();
      return;
    }
    // Reuse the plan already being prefetched when it matches; otherwise plan this mode now.
    const s = s0 ?? (choice === "base" && run.seed === seed ? seed : newSeed());
    setSeed(s);
    const r = s0 === undefined && choice === "base" && s === run.seed ? run : prepare(choice, s, { character: c, profile: p });
    rememberGame(planIds(r));
    begin(c, false, choice);
  }

  const top = () => window.scrollTo({ top: 0, behavior: "smooth" });

  /** Plans a game for (mode, seed) and, unless it's the demo, starts fetching fresh scenarios for it. */
  function prepare(m: Mode, s: number, opts: { demo?: boolean; exclude?: string[]; character?: Character; profile?: Profile } = {}) {
    const p = opts.profile ?? profile;
    const r = planRun(s, m, opts.demo ? [] : loadRecent(), opts.exclude, opts.demo ? {} : { newcomer: p.background === "newcomer" || p.background === "international-student" });
    runToken.current++;
    fetchedFor.current = "";
    setRun(r);
    setScenarios({});
    if (!opts.demo) fetchScenarios(r, m, opts.character ?? character, opts.profile ?? profile);
    return r;
  }
  /** One request per round; skipped when the same plan and profile were already requested. Fallbacks cover any gap. */
  function fetchScenarios(r: RunPlan, m: Mode, c: Character, p: Profile) {
    const key = `${runToken.current}|${c.profession.id}|${JSON.stringify(p)}`;
    if (fetchedFor.current === key) return;
    fetchedFor.current = key;
    const cfg = MODES[m];
    const listingIds = listingsFor(JOURNEY_STAGE, difficulty, r.seed, cfg.listings).map((l) => l.id);
    const offerIds = cfg.offerIds ?? JOURNEY_STAGE.offers.map((o) => o.id);
    const batches = batchesFor(r, listingIds, offerIds, [...cfg.rounds, ...(cfg.scamReport ? ["scamReport"] : [])]);
    const token = runToken.current;
    void prefetchScenarios(batches, scenarioProfile(c.profession.label, p), (items) => {
      if (runToken.current === token) setScenarios((prev) => ({ ...prev, ...items }));
    });
  }

  function begin(c: Character, isDemo = false, m: Mode = mode, from?: BaseCarry) {
    setDemo(isDemo);
    setMode(m);
    setCarry(from);
    if (isDemo) {
      // The demo preset is reproducible: fixed seed, reviewed fallback scenarios only, no API calls.
      setSeed(DEMO_SEED);
      prepare("base", DEMO_SEED, { demo: true });
      setDifficulty("easy");
    } else if (from) {
      // Extended after Base: same character and seed, new questions for the rounds already played.
      prepare("extended", seed, { exclude: from.played, character: c });
    }
    // The Base game is Stage 2 (First job) only; Extended follows the age-based life plan.
    const [lo, hi] = JOURNEY_STAGE.ageRange;
    const full = planLife(m === "base" ? Math.min(hi, Math.max(lo, c.startAge)) : c.startAge);
    const p = m === "base" ? { ...full, playable: full.playable.filter((x) => x.stage.journey).slice(0, 1) } : full;
    setCharacter(c);
    setPlan(p);
    setIndex(0);
    setRecords([]);
    setSkipped([]);
    setScreen(p.playable.length ? "stage" : "end");
    top();
  }

  function advance() {
    if (!plan) return;
    if (index + 1 < plan.playable.length) {
      setIndex(index + 1);
      setScreen("stage");
    } else {
      setScreen("end");
    }
    top();
  }

  const current = plan?.playable[index];

  return (
    // Every button in the game gives a subtle tap sound (PRD v4 Change 1); answers add their own effect on top.
    <div className="game" onClickCapture={(e) => (e.target as HTMLElement).closest("button:not(:disabled)") && play("tap")}>
      {(screen === "stage" || screen === "between" || screen === "end") && plan && !current?.stage.journey && (
        <Hud character={character} age={current?.age ?? character.startAge} stageTitle={screen === "end" ? "Life summary" : current?.stage.title ?? ""} stageId={current?.stage.id} difficulty={difficulty} onQuit={() => { setScreen("title"); top(); }} />
      )}

      {screen === "title" && (
        <TitleScreen
          character={saved}
          onNew={startGame}
          onDemo={() => begin(DEMO_CHARACTER, true, "base")}
          onParty={multiplayerEnabled() ? () => startGame("party") : undefined}
        />
      )}

      {screen === "party" && (
        // Multiplayer is behind a feature flag (PRD v4 Change 5); single-player never depends on it.
        <Multiplayer character={saved ?? character} onExit={() => (setScreen("title"), top())} />
      )}


      {(screen === "stage" || screen === "between") && plan && current && (
        <>
          {!current.stage.journey && <Timeline plan={plan} index={index} records={records} skipped={skipped} between={screen === "between"} character={character} />}
          {screen === "stage" && current.stage.journey && (
            // Game-show presentation (PRD v2 §5.10). The demo preset is the Base game with stat cards on a 3-second auto-advance.
            <ShowSettingsProvider initial={demo ? { textSpeed: "normal", showStats: true, statMs: 3000 } : undefined}>
              <JourneyShow
                key={`${current.stage.id}-${seed}-${mode}`}
                mode={mode}
                carry={carry}
                plan={run}
                scenarios={scenarios}
                values={scenarioValues(profile)}
                profile={demo ? {} : profile}
                onProfile={(p) => {
                  setProfile(p);
                  saveProfile(p);
                }}
                onExtended={(from) => begin(character, false, "extended", from)}
                stage={current.stage}
                age={current.age}
                character={character}
                difficulty={difficulty}
                seed={seed}
                scriptedLandlord={demo}
                onReplay={() => {
                  const s = demo ? DEMO_SEED + Math.floor(Math.random() * 1000) + 1 : newSeed();
                  setCarry(undefined);
                  setSeed(s);
                  const r = prepare(mode, s, { demo });
                  if (!demo) rememberGame(planIds(r));
                  top();
                }}
                onQuit={() => {
                  setScreen("title");
                  top();
                }}
              />
            </ShowSettingsProvider>
          )}
          {screen === "stage" && !current.stage.journey && (
            <StageView
              key={current.stage.id}
              stage={current.stage}
              age={current.age}
              character={character}
              difficulty={difficulty}
              scriptedLandlord={demo}
              onComplete={(r) => {
                setRecords([...records, r]);
                setScreen("between");
                top();
              }}
              onSkip={() => {
                setSkipped([...skipped, current.stage.id]);
                advance();
              }}
            />
          )}
          {screen === "between" && (
            <Between character={character} records={records} plan={plan} index={index} difficulty={difficulty} setDifficulty={setDifficulty} onNext={advance} />
          )}
        </>
      )}

      {screen === "end" && plan && <EndScreen character={character} plan={plan} records={records} skipped={skipped} onRestart={() => { setScreen("title"); top(); }} />}

      {screen !== "title" && screen !== "party" && !(screen === "stage" && current?.stage.journey) && (
        <div className="panel legend-bar">
          <Legend />
        </div>
      )}
    </div>
  );
}

function Hud(props: { character: Character; age: number; stageTitle: string; stageId?: string; difficulty: Difficulty; onQuit: () => void }) {
  const { character, age, stageTitle, stageId, difficulty, onQuit } = props;
  const job = stageId ? character.profession.path[stageId]?.title : undefined;
  return (
    <div className="hud">
      <div className="hud-who">
        <div className="hud-avatar">
          <Sprite appearance={character.appearance} scale={2} />
        </div>
        <div>
          <div className="pixel hud-name">
            {character.name}, {age}
          </div>
          <div className="small">{job ?? character.profession.label}</div>
        </div>
      </div>
      <div className="hud-stage">
        <span className="pixel">{stageTitle}</span>
        <span className="tab diff">{DIFFICULTY_INFO[difficulty].label}</span>
      </div>
      <button className="btn ghost small" onClick={onQuit}>
        Quit
      </button>
    </div>
  );
}

function TitleScreen({ character, onNew, onDemo, onParty }: { character: Character | null; onNew: (m: Mode) => void; onDemo: () => void; onParty?: () => void }) {
  const steps = ["Choose a home", "See what you missed", "Read the evidence", "Find who has power", "Ask a better question"];
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Toronto municipal election · Monday, Oct 26, 2026</span>
          <h1>
            Toronto <span className="neon">Rent</span> Decisions
          </h1>
          <p className="lede">
            Live a Toronto life one rental at a time. Weigh rent against commute, find what you didn&apos;t know, then work out which parts of the problem
            your next city council can actually change.
          </p>
          <div className="row">
            <button className="btn big" onClick={() => onNew("base")}>
              <Icon name="play" /> Play
            </button>
            <button className="btn blue big" onClick={() => onNew("extended")}>
              Extended game
            </button>
            <button className="btn ghost" onClick={onDemo}>
              Demo preset
            </button>
            {onParty && (
              <button className="btn ghost" onClick={onParty}>
                <Icon name="users" /> Multiplayer
              </button>
            )}
          </div>
          <p className="small on-dark">
            Play: {MODES.base.blurb} Extended: {MODES.extended.blurb} No sign-up · nonpartisan
          </p>
        </div>
        <div className="hero-art">
          <TitleScene />
          <p className="pixel blink press">Press start</p>
        <div className="char-card">
          {character ? (
            <>
              <Sprite appearance={character.appearance} scale={3} />
              <span>
                Playing as <b>{character.name || "Player"}</b>, {character.startAge}
              </span>
              <Link className="btn ghost small" href="/character">
                Edit character
              </Link>
            </>
          ) : (
            <Link className="btn ghost small" href="/character">
              <Icon name="user" /> Create your character first
            </Link>
          )}
        </div>
        </div>
      </section>

      <ol className="steps-strip" aria-label="Each life stage">
        {steps.map((s, i) => (
          <li key={s}>
            <span className="num">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      <section className="feature-grid">
        <article className="paper">
          <h3>Fictional homes, real Toronto data</h3>
          <p>Offers are made up and labelled as such. Rents, census figures and fares come from CMHC, the City and the TTC, each with a source.</p>
        </article>
        <article className="paper">
          <h3>Haggle if you want</h3>
          <p>Negotiate with a landlord before signing. The landlord&apos;s words may come from AI; the deal is always decided by game code.</p>
        </article>
        <article className="paper">
          <h3>Leave with a question</h3>
          <p>Every stage ends with a neutral, sourced question for municipal candidates, built from your own choices.</p>
        </article>
      </section>
    </div>
  );
}

function Timeline(props: { plan: LifePlan; index: number; records: StageRecord[]; skipped: string[]; between: boolean; character: Character }) {
  const { plan, index, records, skipped, between, character } = props;
  const currentId = plan.playable[index]?.stage.id;
  const doneIds = new Set([...records.map((r) => r.stageId), ...skipped]);
  return (
    <nav className="timeline panel" aria-label="Life stages">
      {STAGES.map((s, i) => {
        const soon = plan.comingSoon.some((x) => x.id === s.id) || s.order < plan.start.order;
        const cls = doneIds.has(s.id) ? "done" : s.id === currentId && !between ? "current" : soon ? "soon" : "";
        return (
          <div key={s.id} style={{ display: "contents" }}>
            {i > 0 && <div className="tl-line" />}
            <div className={`tl-node ${cls}`} title={plan.comingSoon.some((x) => x.id === s.id) ? "Coming soon: civic lever not yet sourced" : undefined}>
              <span className="dot" />
              <span className="lbl">
                {s.title}
                <br />
                {plan.comingSoon.some((x) => x.id === s.id) ? "coming soon" : `age ${plan.playable.find((p) => p.stage.id === s.id)?.age ?? s.defaultAge}`}
              </span>
              <span className="job">{character.profession.path[s.id]?.title}</span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function TrackerTable({ records }: { records: StageRecord[] }) {
  return (
    <table className="tracker">
      <thead>
        <tr>
          <th>Stage</th>
          <th>Home</th>
          <th>Unknowns flagged before choosing</th>
          <th>Revealed unknown flagged?</th>
          <th>Lever attributed correctly?</th>
          <th>Difficulty</th>
          <th>Reasoning score</th>
        </tr>
      </thead>
      <tbody>
        {records.map((r) => {
          const hit = r.unknowns.filter((u) => r.flagged.includes(u)).length;
          return (
            <tr key={r.stageId}>
              <td>
                {r.stageTitle} (age {r.age})
              </td>
              <td>
                {r.offerTitle}, {r.neighbourhood}
                {r.negotiated && (
                  <span className="note">
                    Negotiated {money(r.negotiated.fromCents)} → {money(r.negotiated.toCents)}
                    {r.negotiated.extras.length ? ` + ${r.negotiated.extras.join(", ").toLowerCase()}` : ""} (illustrative)
                  </span>
                )}
              </td>
              <td>
                {hit} of {r.unknowns.length}
              </td>
              <td className={r.flaggedRevealed ? "yes" : "no"}>{r.flaggedRevealed ? "Yes" : "No"}</td>
              <td className={r.leverCorrect ? "yes" : "no"}>
                {r.leverCorrect ? "Yes" : "No"} ({r.civicCorrect}/{r.civicTotal} sorted)
              </td>
              <td>{DIFFICULTY_INFO[r.difficulty].label}</td>
              <td>
                <b>{r.score.total}</b>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Between(props: {
  character: Character;
  records: StageRecord[];
  plan: LifePlan;
  index: number;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  onNext: () => void;
}) {
  const { character, records, plan, index, difficulty, setDifficulty, onNext } = props;
  const next = plan.playable[index + 1];
  return (
    <div className="paper">
      <div className="scene">
        <div className="sprite-frame">
          <Sprite appearance={character.appearance} scale={6} />
        </div>
        <div>
          <span className="eyebrow">Saved to your civic notebook</span>
          <h2>{next ? `Time passes… ${character.name} is now ${next.age}.` : "That's every playable stage."}</h2>
          <p className="muted">Your reasoning so far. This tracks how you reason, not what you spent or where you lived.</p>
        </div>
      </div>
      <TrackerTable records={records} />
      <ScoreBox score={records[records.length - 1].score} />
      {next && <DifficultyPicker value={difficulty} onChange={setDifficulty} />}
      <button className="btn green" style={{ marginTop: 14 }} onClick={onNext}>
        {next ? `Next stage: ${next.stage.title}` : "Finish life"} <Icon name="chevron-right" />
      </button>
    </div>
  );
}

function EndScreen({ character, plan, records, skipped, onRestart }: { character: Character; plan: LifePlan; records: StageRecord[]; skipped: string[]; onRestart: () => void }) {
  const [pick, setPick] = useState(records.length ? records[records.length - 1].stageId : "");
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const chosen = records.find((r) => r.stageId === pick);

  async function copy() {
    if (!chosen) return;
    const text = `${chosen.question.text}\n\nSources:\n${chosen.question.citations.map((c) => `- ${c.label}${c.url ? `: ${c.url}` : ""}`).join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      // Clipboard API is unavailable on insecure origins; fall back to a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      setCopied(ok ? "ok" : "fail");
    }
  }

  const trend =
    records.length >= 2
      ? (() => {
          const first = records[0];
          const last = records[records.length - 1];
          const score = (r: StageRecord) => Number(r.flaggedRevealed) + Number(r.leverCorrect);
          return score(last) > score(first) ? "Your reasoning improved between stages." : score(last) === score(first) ? "Your reasoning held steady across stages." : "Your later stage was harder: look back at what you missed.";
        })()
      : null;

  return (
    <section className="stack">
      <div className="paper scene">
        <div className="sprite-frame">
          <Sprite appearance={character.appearance} scale={8} />
        </div>
        <div>
          <span className="eyebrow">Life summary</span>
          <h2>{character.name}&apos;s Toronto homes</h2>
          {records.length === 0 ? (
            <p>
              {plan.playable.length === 0
                ? `Starting at age ${character.startAge} lands in a stage that isn't playable yet: its civic lever still needs an official source.`
                : "You skipped every stage, so there's nothing in your notebook yet."}
            </p>
          ) : (
            <ul>
              {records.map((r) => (
                <li key={r.stageId}>
                  Age {r.age}, {r.stageTitle} ({character.profession.path[r.stageId]?.title}): {r.offerTitle} in {r.neighbourhood}
                </li>
              ))}
            </ul>
          )}
          {skipped.length > 0 && <p className="small muted">Skipped: {skipped.join(", ")}</p>}
          {plan.comingSoon.length > 0 && (
            <p className="small muted">Coming soon: {plan.comingSoon.map((s) => s.title).join(", ")} (their civic levers still need official sources).</p>
          )}
        </div>
      </div>

      {records.length > 0 && (
        <>
          <div className="paper">
            <span className="eyebrow">Reasoning tracker</span>
            {trend && <h2>{trend}</h2>}
            <p>
              Total reasoning score: <b>{records.reduce((a, r) => a + r.score.total, 0)}</b>
            </p>
            <TrackerTable records={records} />
          </div>

          <div className="paper">
            <span className="eyebrow">Civic notebook</span>
            <h2>Pick one question to ask a candidate</h2>
            <div className="notebook">
              {records.map((r) => (
                <label key={r.stageId} className={pick === r.stageId ? "on" : ""}>
                  <input type="radio" name="q" checked={pick === r.stageId} onChange={() => setPick(r.stageId)} />
                  <span>
                    <span className="draft-tag">
                      {r.stageTitle} · draft
                    </span>
                    <br />
                    {r.question.text}
                    {r.personalAction && <span className="note">Personal step: {r.personalAction}</span>}
                  </span>
                </label>
              ))}
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn green" onClick={copy} disabled={!chosen}>
                <Icon name="clipboard" /> Copy question + sources
              </button>
              <a className="btn blue" href={ELECTION_HUB.url} target="_blank" rel="noreferrer">
                City election hub <Icon name="external-link" />
              </a>
              {copied === "ok" && <span className="yes">Copied!</span>}
              {copied === "fail" && <span className="no">Couldn&apos;t copy. Select the text above instead.</span>}
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              Draft questions are a starting point, not an endorsement of any candidate or a prediction of any outcome.
            </p>
          </div>
        </>
      )}

      <div>
        <button className="btn" onClick={onRestart}>
          <Icon name="play" /> Play again
        </button>
      </div>
    </section>
  );
}
