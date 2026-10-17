"use client";

import { useState } from "react";
import { Legend, Sprite, TitleScene } from "@/components/pixel";
import { ScoreBox, StageView, type StageRecord } from "@/components/StageView";
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

  const top = () => window.scrollTo({ top: 0, behavior: "smooth" });

  function begin(c: Character, isDemo = false) {
    setDemo(isDemo);
    if (isDemo) setDifficulty("easy");
    const p = planLife(c.startAge);
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
    <main>
      {screen !== "title" && (
        <div className="spread" style={{ marginBottom: 6 }}>
          <span className="pixel" style={{ fontSize: "0.7rem", color: "var(--yellow)" }}>
            Toronto Rent Decisions
          </span>
          <button className="btn ghost small" onClick={() => setScreen("title")}>
            Quit to title
          </button>
        </div>
      )}

      {screen === "title" && (
        <TitleScreen
          onNew={() => {
            setCharacter({ ...DEMO_CHARACTER, name: "", startAge: DEFAULT_AGE });
            setScreen("create");
            top();
          }}
          onDemo={() => begin(DEMO_CHARACTER, true)}
        />
      )}

      {screen === "create" && (
        <Creator
          character={character}
          setCharacter={setCharacter}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          onStart={() => begin({ ...character, name: character.name.trim() || "Player" })}
        />
      )}

      {(screen === "stage" || screen === "between") && plan && current && (
        <>
          <Timeline plan={plan} index={index} records={records} skipped={skipped} between={screen === "between"} />
          {screen === "stage" && (
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

      {screen === "end" && plan && <EndScreen character={character} plan={plan} records={records} skipped={skipped} onRestart={() => setScreen("title")} />}

      {screen !== "title" && (
        <div style={{ marginTop: 20 }}>
          <Legend />
        </div>
      )}
      <footer className="site">
        Offers, people and incomes are fictional (labelled illustrative). Real data: City of Toronto Open Data (Open Government Licence – Toronto), CMHC
        Rental Market Survey (adapted; not endorsed by CMHC), TTC fares, Province of Ontario. Nonpartisan: this game doesn&apos;t endorse candidates or
        predict policy outcomes. <a href={ELECTION_HUB.url}>Toronto municipal election: Monday, October 26, 2026</a>.
      </footer>
    </main>
  );
}

function TitleScreen({ onNew, onDemo }: { onNew: () => void; onDemo: () => void }) {
  return (
    <section className="title-screen">
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <TitleScene />
      </div>
      <div className="title-card">
        <h1>Toronto Rent Decisions</h1>
        <p className="tag">
          Live a Toronto life one rental at a time. Weigh rent against commute, find what you didn&apos;t know, then work out which parts of the problem
          your next city council can actually change. You&apos;ll leave with one sourced question for municipal candidates.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={onNew}>
            ▶ New game
          </button>
          <button className="btn blue" onClick={onDemo}>
            Demo preset
          </button>
        </div>
        <p className="pixel blink" style={{ fontSize: "0.6rem", marginTop: 18, color: "#cfc8de" }}>
          Election day · Oct 26, 2026
        </p>
      </div>
    </section>
  );
}

function DifficultyPicker({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
  return (
    <div>
      <h3>Difficulty</h3>
      <div className="row" style={{ gap: 4 }}>
        {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
          <button key={d} className={`choice ${d === value ? "on" : ""}`} onClick={() => onChange(d)} aria-pressed={d === value}>
            {DIFFICULTY_INFO[d].label}
          </button>
        ))}
      </div>
      <p className="small">
        {DIFFICULTY_INFO[value].blurb} Difficulty changes how information is shown, never what is true, and multiplies your reasoning score.
      </p>
    </div>
  );
}

function Creator(props: {
  character: Character;
  setCharacter: (c: Character) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  onStart: () => void;
}) {
  const { character, setCharacter, difficulty, setDifficulty, onStart } = props;
  const a = character.appearance;
  const setA = (patch: Partial<Appearance>) => setCharacter({ ...character, appearance: { ...a, ...patch } });
  const plan = planLife(character.startAge);
  const start = stageForAge(character.startAge);
  const randomize = () =>
    setA({
      skin: Math.floor(Math.random() * SKIN.length),
      hairStyle: HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)],
      hairColor: Math.floor(Math.random() * HAIR_COLOR.length),
      outfit: OUTFITS[Math.floor(Math.random() * OUTFITS.length)],
      outfitColor: Math.floor(Math.random() * OUTFIT_COLOR.length),
      accessory: ACCESSORIES[Math.floor(Math.random() * ACCESSORIES.length)],
    });

  return (
    <section className="creator">
      <div className="paper stage-preview">
        <span className="eyebrow">Character</span>
        <div className="sprite-frame">
          <Sprite appearance={a} scale={10} />
        </div>
        <div className="pixel" style={{ fontSize: "0.7rem" }}>
          {character.name.trim() || "Player"}, {character.startAge}
        </div>
        <button className="btn ghost small" onClick={randomize}>
          🎲 Randomize look
        </button>
        <p className="note">Appearance is cosmetic only. It never changes income, offers, outcomes or feedback.</p>
      </div>

      <div className="paper options">
        <div>
          <h3>Name</h3>
          <input className="field-input" value={character.name} maxLength={16} placeholder="Player" onChange={(e) => setCharacter({ ...character, name: e.target.value })} />
        </div>
        <div>
          <h3>Starting age: {character.startAge}</h3>
          <input
            type="range"
            min={MIN_AGE}
            max={MAX_AGE}
            value={character.startAge}
            onChange={(e) => setCharacter({ ...character, startAge: Number(e.target.value) })}
            aria-label="Starting age"
          />
          <p className="small">
            Starts at stage {start.order}: <b>{start.title}</b>.{" "}
            {plan.playable.length > 0
              ? `You'll play: ${plan.playable.map((p) => `${p.stage.title} (age ${p.age})`).join(" → ")}.`
              : "That stage isn't playable yet (its civic lever still needs an official source). Pick 25 or younger to play."}
          </p>
        </div>
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <Swatches label="Skin tone" colors={SKIN} value={a.skin} onPick={(i) => setA({ skin: i })} />
        <Choices label="Hair style" options={HAIR_STYLES} value={a.hairStyle} onPick={(v) => setA({ hairStyle: v })} />
        <Swatches label="Hair colour" colors={HAIR_COLOR} value={a.hairColor} onPick={(i) => setA({ hairColor: i })} />
        <Choices label="Outfit" options={OUTFITS} value={a.outfit} onPick={(v) => setA({ outfit: v })} />
        <Swatches label="Outfit colour" colors={OUTFIT_COLOR} value={a.outfitColor} onPick={(i) => setA({ outfitColor: i })} />
        <Choices label="Accessory" options={ACCESSORIES} value={a.accessory} onPick={(v) => setA({ accessory: v })} />
        <div>
          <button className="btn" disabled={plan.playable.length === 0} onClick={onStart}>
            ▶ Start life
          </button>
        </div>
      </div>
    </section>
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

function Timeline({ plan, index, records, skipped, between }: { plan: LifePlan; index: number; records: StageRecord[]; skipped: string[]; between: boolean }) {
  const currentId = plan.playable[index]?.stage.id;
  const doneIds = new Set([...records.map((r) => r.stageId), ...skipped]);
  return (
    <nav className="timeline" aria-label="Life stages">
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
                  Age {r.age}, {r.stageTitle}: {r.offerTitle} in {r.neighbourhood}
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
