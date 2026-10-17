"use client";

import { useRef, useState } from "react";
import { Legend, Sprite, TitleScene } from "@/components/pixel";
import { JourneyShow, type BaseCarry } from "@/components/show/JourneyShow";
import { ShowSettingsProvider } from "@/components/show/settings";
import { ScoreBox, StageView, type StageRecord } from "@/components/StageView";
import { MODES, type Mode } from "@/config/modes";
import { DEMO_SEED, newSeed } from "@/game/journey";
import { PRESETS, presetProfession } from "@/game/career";
import { ELECTION_HUB, STAGES } from "@/game/data";
import { money } from "@/game/outcome";
import { DEFAULT_AGE, MAX_AGE, MIN_AGE, planLife, stageForAge, type LifePlan } from "@/game/life";
import { DIFFICULTY_INFO } from "@/game/score";
import type { Difficulty } from "@/game/types";
import {
  ACCESSORIES,
  DEMO_CHARACTER,
  HAIR_COLOR,
  HAIR_STYLES,
  OUTFIT_COLOR,
  OUTFITS,
  SKIN,
  type Appearance,
  type Character,
} from "@/game/sprite";

type Screen = "title" | "create" | "stage" | "between" | "end";

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

  const top = () => window.scrollTo({ top: 0, behavior: "smooth" });

  function begin(c: Character, isDemo = false, m: Mode = mode, from?: BaseCarry) {
    setDemo(isDemo);
    setMode(m);
    setCarry(from);
    setSeed(isDemo ? DEMO_SEED : from ? seed : newSeed());
    if (isDemo) setDifficulty("easy");
    // The Base game is Stage 2 (First job) only; Extended follows the age-based life plan.
    const full = planLife(m === "base" ? DEFAULT_AGE : c.startAge);
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
    <div className="game">
      {(screen === "stage" || screen === "between" || screen === "end") && plan && !current?.stage.journey && (
        <Hud character={character} age={current?.age ?? character.startAge} stageTitle={screen === "end" ? "Life summary" : current?.stage.title ?? ""} stageId={current?.stage.id} difficulty={difficulty} onQuit={() => { setScreen("title"); top(); }} />
      )}

      {screen === "title" && (
        <TitleScreen
          onNew={(m) => {
            setMode(m);
            setCharacter({ ...DEMO_CHARACTER, name: "", startAge: DEFAULT_AGE });
            setScreen("create");
            top();
          }}
          onDemo={() => begin(DEMO_CHARACTER, true, "base")}
        />
      )}

      {screen === "create" && (
        <Creator
          mode={mode}
          setMode={setMode}
          character={character}
          setCharacter={setCharacter}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          onBack={() => { setScreen("title"); top(); }}
          onStart={() => begin({ ...character, name: character.name.trim() || "Player" })}
        />
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
                onExtended={(from) => begin(character, false, "extended", from)}
                stage={current.stage}
                age={current.age}
                character={character}
                difficulty={difficulty}
                seed={seed}
                scriptedLandlord={demo}
                onReplay={() => {
                  setCarry(undefined);
                  setSeed(newSeed());
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

      {screen !== "title" && !(screen === "stage" && current?.stage.journey) && (
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

function TitleScreen({ onNew, onDemo }: { onNew: (m: Mode) => void; onDemo: () => void }) {
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
              ▶ Play
            </button>
            <button className="btn blue big" onClick={() => onNew("extended")}>
              Extended game
            </button>
            <button className="btn ghost" onClick={onDemo}>
              Demo preset
            </button>
          </div>
          <p className="small on-dark">
            Play: {MODES.base.blurb} Extended: {MODES.extended.blurb} No sign-up · nonpartisan
          </p>
        </div>
        <div className="hero-art">
          <TitleScene />
          <p className="pixel blink press">Press start</p>
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

function DifficultyPicker({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
  return (
    <div className="field">
      <h3>Difficulty</h3>
      <div className="seg">
        {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
          <button key={d} className={`choice ${d === value ? "on" : ""}`} onClick={() => onChange(d)} aria-pressed={d === value}>
            {DIFFICULTY_INFO[d].label}
          </button>
        ))}
      </div>
      <p className="small muted">{DIFFICULTY_INFO[value].blurb} It changes how information is shown, never what is true.</p>
    </div>
  );
}

const NAMES = ["Sam", "Priya", "Jordan", "Mei", "Alex", "Tariq", "Riley", "Ana", "Kofi", "Noor"];

type SetCharacter = React.Dispatch<React.SetStateAction<Character>>;

/** `llm` false (Base game): handwritten paths only, no API call. */
function ProfessionPicker({ character, setCharacter, llm }: { character: Character; setCharacter: SetCharacter; llm: boolean }) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const latest = useRef(0);
  const p = character.profession;

  /** Asks the server for a fresh path; only the most recent request may update the character. */
  async function request(body: { presetId: string } | { profession: string }) {
    const ticket = ++latest.current;
    setBusy(true);
    setMsg("Writing a job path…");
    try {
      const res = await fetch("/api/career", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (ticket !== latest.current) return;
      if (!res.ok) throw new Error(data.error ?? "Couldn't build a job path");
      setCharacter((c) => ({ ...c, profession: data.profession }));
      setMsg(
        data.profession.source === "llm"
          ? "Job path written by Gemini (story only)."
          : data.profession.source === "preset"
            ? `Using the handwritten path (${data.fallbackReason}).`
            : `Used a simple template (${data.fallbackReason}).`,
      );
    } catch (e) {
      if (ticket === latest.current) setMsg(e instanceof Error ? e.message : "Couldn't build a job path");
    } finally {
      if (ticket === latest.current) setBusy(false);
    }
  }

  function pickPreset(id: string) {
    // Show the handwritten path at once, then let Gemini replace it with a fresh one.
    setCharacter((c) => ({ ...c, profession: presetProfession(id) }));
    if (llm) request({ presetId: id });
  }

  return (
    <div className="field">
      <h3>Starting profession</h3>
      <div className="row" style={{ gap: 4 }}>
        {PRESETS.map((x) => (
          <button key={x.id} className={`choice ${p.id === x.id ? "on" : ""}`} onClick={() => pickPreset(x.id)} aria-pressed={p.id === x.id}>
            {x.label}
          </button>
        ))}
      </div>
      {llm && (
        <form
          className="row"
          style={{ marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            request({ profession: custom });
          }}
        >
          <input className="field-input" value={custom} maxLength={40} placeholder="Other: e.g. pharmacist" onChange={(e) => setCustom(e.target.value)} aria-label="Custom profession" />
          <button className="btn blue small" disabled={busy || custom.trim().length < 2}>
            {busy ? "Writing…" : "Generate job path"}
          </button>
        </form>
      )}
      {msg && <p className="small">{msg}</p>}
      <ol className="path">
        {STAGES.map((s) => {
          const w = p.source === "preset" ? p.work?.[s.id] : undefined;
          return (
            <li key={s.id} className={s.enabled ? "" : "soon"}>
              <span className="pixel">{s.title}</span> {p.path[s.id]?.title}
              {w && (
                <span className="small muted">
                  {" "}
                  · {money(w.income.amountCents)}/{w.income.period === "annual" ? "yr" : "mo"} {w.income.basis} · {w.commuteDaysPerMonth} commute days/mo
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="note">
        {p.source === "preset"
          ? "Each preset job sets its own illustrative income and commute days. Offers, evidence and scoring stay the same for everyone."
          : "A custom job shapes the story only: it uses the stage's default income and commute days, because AI never sets numbers."}
      </p>
    </div>
  );
}

function Creator(props: {
  mode: Mode;
  setMode: (m: Mode) => void;
  character: Character;
  setCharacter: SetCharacter;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const { mode, setMode, character, setCharacter, difficulty, setDifficulty, onBack, onStart } = props;
  const base = mode === "base";
  const a = character.appearance;
  const setA = (patch: Partial<Appearance>) => setCharacter({ ...character, appearance: { ...a, ...patch } });
  const plan = planLife(character.startAge);
  const start = stageForAge(character.startAge);
  const randomize = () =>
    setCharacter({
      ...character,
      name: character.name || NAMES[Math.floor(Math.random() * NAMES.length)],
      appearance: {
        ...a,
      skin: Math.floor(Math.random() * SKIN.length),
      hairStyle: HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)],
      hairColor: Math.floor(Math.random() * HAIR_COLOR.length),
      outfit: OUTFITS[Math.floor(Math.random() * OUTFITS.length)],
      outfitColor: Math.floor(Math.random() * OUTFIT_COLOR.length),
      accessory: ACCESSORIES[Math.floor(Math.random() * ACCESSORIES.length)],
      },
    });

  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">New game · {MODES[mode].label}</span>
        <h1>{base ? "Quick character" : "Create your character"}</h1>
        <div className="row quick-start">
          <button className="btn big" disabled={plan.playable.length === 0 && !base} onClick={onStart}>
            ▶ Start
          </button>
          <button className="btn ghost" onClick={randomize}>
            🎲 Randomize
          </button>
          <button className="btn ghost small" onClick={() => setMode(base ? "extended" : "base")}>
            Switch to {base ? MODES.extended.label : MODES.base.label}
          </button>
        </div>
        {base && <p className="small">Everything below is optional. The Base game makes no AI or API calls.</p>}
      </header>
      <section className="creator">
        <aside className="paper stage-preview">
          <div className="sprite-frame">
            <Sprite appearance={a} scale={10} />
          </div>
          <div className="pixel" style={{ fontSize: "0.7rem" }}>
            {character.name.trim() || "Player"}, {character.startAge}
          </div>
          <div className="small">{character.profession.path[start.id]?.title ?? character.profession.label}</div>
          <button className="btn ghost small" onClick={randomize}>
            🎲 Randomize
          </button>
          <p className="note">Appearance is cosmetic only. It never changes income, offers, outcomes or feedback.</p>
          <div className="preview-actions">
            <button className="btn big" disabled={plan.playable.length === 0 && !base} onClick={onStart}>
              ▶ Start
            </button>
            <button className="btn ghost small" onClick={onBack}>
              Back
            </button>
          </div>
        </aside>

        <div className="options">
          <fieldset className="paper group">
            <legend>Who you are</legend>
            <div className="field">
              <h3>Name</h3>
              <input className="field-input" value={character.name} maxLength={16} placeholder="Player" onChange={(e) => setCharacter({ ...character, name: e.target.value })} />
            </div>
            {!base && (
              <div className="field">
                <h3>Starting age: {character.startAge}</h3>
                <input type="range" min={MIN_AGE} max={MAX_AGE} value={character.startAge} onChange={(e) => setCharacter({ ...character, startAge: Number(e.target.value) })} aria-label="Starting age" />
                <p className="small">
                  Starts at stage {start.order}: <b>{start.title}</b>.{" "}
                  {plan.playable.length > 0
                    ? `You'll play: ${plan.playable.map((p) => `${p.stage.title} (age ${p.age})`).join(" → ")}.`
                    : "That stage isn't playable yet (its civic lever still needs an official source). Pick 25 or younger to play."}
                </p>
              </div>
            )}
            <ProfessionPicker character={character} setCharacter={setCharacter} llm={MODES[mode].apiCalls} />
          </fieldset>

          <fieldset className="paper group">
            <legend>Look</legend>
            <Swatches label="Skin tone" colors={SKIN} value={a.skin} onPick={(i) => setA({ skin: i })} />
            <Choices label="Hair style" options={HAIR_STYLES} value={a.hairStyle} onPick={(v) => setA({ hairStyle: v })} />
            <Swatches label="Hair colour" colors={HAIR_COLOR} value={a.hairColor} onPick={(i) => setA({ hairColor: i })} />
            <Choices label="Outfit" options={OUTFITS} value={a.outfit} onPick={(v) => setA({ outfit: v })} />
            <Swatches label="Outfit colour" colors={OUTFIT_COLOR} value={a.outfitColor} onPick={(i) => setA({ outfitColor: i })} />
            <Choices label="Accessory" options={ACCESSORIES} value={a.accessory} onPick={(v) => setA({ accessory: v })} />
          </fieldset>

          <fieldset className="paper group">
            <legend>Game</legend>
            <DifficultyPicker value={difficulty} onChange={setDifficulty} />
          </fieldset>
        </div>
      </section>
    </div>
  );
}

function Swatches({ label, colors, value, onPick }: { label: string; colors: readonly string[]; value: number; onPick: (i: number) => void }) {
  return (
    <div>
      <h3>{label}</h3>
      <div className="row" style={{ gap: 12, paddingLeft: 4 }}>
        {colors.map((c, i) => (
          <button key={c} className={`swatch ${i === value ? "on" : ""}`} style={{ background: c }} onClick={() => onPick(i)} aria-label={`${label} ${i + 1}`} aria-pressed={i === value} />
        ))}
      </div>
    </div>
  );
}

function Choices<T extends string>({ label, options, value, onPick }: { label: string; options: readonly T[]; value: T; onPick: (v: T) => void }) {
  return (
    <div>
      <h3>{label}</h3>
      <div className="row" style={{ gap: 4 }}>
        {options.map((o) => (
          <button key={o} className={`choice ${o === value ? "on" : ""}`} onClick={() => onPick(o)} aria-pressed={o === value}>
            {o}
          </button>
        ))}
      </div>
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
        {next ? `Next stage: ${next.stage.title} ▶` : "Finish life ▶"}
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
                📋 Copy question + sources
              </button>
              <a className="btn blue" href={ELECTION_HUB.url} target="_blank" rel="noreferrer">
                City election hub ↗
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
          ▶ Play again
        </button>
      </div>
    </section>
  );
}
