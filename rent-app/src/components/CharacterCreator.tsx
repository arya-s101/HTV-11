"use client";

// Character creation (its own page, /character): one character for every game, single-player and multiplayer.
import Link from "next/link";
import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Sprite } from "@/components/pixel";
import { ProfileForm } from "@/components/ProfileForm";
import { PRESETS, presetProfession } from "@/game/career";
import { STAGES } from "@/game/data";
import { MAX_AGE, MIN_AGE, planLife, stageForAge } from "@/game/life";
import { money } from "@/game/outcome";
import type { Profile } from "@/game/profile";
import { DIFFICULTY_INFO } from "@/game/score";
import { ACCESSORIES, HAIR_COLOR, HAIR_STYLES, OUTFIT_COLOR, OUTFITS, SKIN, type Appearance, type Character } from "@/game/sprite";
import type { Difficulty, PlayableStage } from "@/game/types";

const JOURNEY_STAGE = STAGES.find((s) => s.journey)! as PlayableStage;

export function DifficultyPicker({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
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

export function CharacterCreator(props: {
  character: Character;
  setCharacter: SetCharacter;
  profile: Profile;
  setProfile: (p: Profile) => void;
  clearProfile: () => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
}) {
  const { character, setCharacter, profile, setProfile, clearProfile, difficulty, setDifficulty } = props;
  const [minAge, maxAge] = [MIN_AGE, MAX_AGE];
  const suggested: Difficulty | null = profile.renting === "first" ? "easy" : profile.renting === "before" ? "normal" : null;
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
        <span className="eyebrow">Your character · used in every game, single-player and multiplayer · saved automatically</span>
        <h1>Your character</h1>
        <div className="row quick-start">
          <Link className="btn big" href="/">
            Back to main menu
          </Link>
          <button className="btn ghost" onClick={randomize}>
            <Icon name="dice" /> Randomize
          </button>
        </div>
        <p className="small">Saved on this device. Name, look, age and career are all you need; everything else is optional. Works without AI; when available, Gemini only varies the scene wording.</p>
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
            <Icon name="dice" /> Randomize
          </button>
          <p className="note">Appearance is cosmetic only. It never changes income, offers, outcomes or feedback.</p>
          <div className="preview-actions">
            <Link className="btn big" href="/">
              Back to main menu
            </Link>
          </div>
        </aside>

        <div className="options">
          <fieldset className="paper group">
            <legend>Who you are</legend>
            <div className="field">
              <h3>Name</h3>
              <input className="field-input" value={character.name} maxLength={16} placeholder="Player" onChange={(e) => setCharacter({ ...character, name: e.target.value })} />
            </div>
            <div className="field">
              <h3>Age: {character.startAge}</h3>
              <input type="range" min={minAge} max={maxAge} value={Math.min(maxAge, Math.max(minAge, character.startAge))} onChange={(e) => setCharacter({ ...character, startAge: Number(e.target.value) })} aria-label="Age" />
            </div>
            {(
              <div className="field">
                <p className="small">The Base game plays the First job stage (ages {JOURNEY_STAGE.ageRange.join("–")}). Extended:{" "}
                  Starts at stage {start.order}: <b>{start.title}</b>.{" "}
                  {plan.playable.length > 0
                    ? `You'll play: ${plan.playable.map((p) => `${p.stage.title} (age ${p.age})`).join(" → ")}.`
                    : "That stage isn't playable yet (its civic lever still needs an official source). Pick 25 or younger to play."}
                </p>
              </div>
            )}
            <ProfessionPicker character={character} setCharacter={setCharacter} llm />
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
            {suggested && suggested !== difficulty && (
              <p className="small">
                Suggested for {profile.renting === "first" ? "first-time renters" : "experienced renters"}: {DIFFICULTY_INFO[suggested].label}.{" "}
                <button className="btn ghost small" onClick={() => setDifficulty(suggested)}>
                  Use it
                </button>
              </p>
            )}
          </fieldset>

          <details className="paper group tell-more">
            <summary className="pixel">Tell us more (optional)</summary>
            <ProfileForm profile={profile} onChange={setProfile} onClear={clearProfile} />
          </details>
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
