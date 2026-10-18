"use client";

// Game-show building blocks. Phases supply lines and choices; these own the layout and the juice.
import { Icon } from "@/components/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import showJson from "../../../data/game/show.json";
import { content, CONTENT_DISCLAIMER } from "@/game/journey";
import type { Field } from "@/game/types";
import { HostAvatar } from "./HostAvatar";
import { play } from "../audio";
import { CHAR_MS, LINE_PAUSE_MS, useSettings } from "./settings";
import { useStatGate } from "./StatCard";
import { narrator, useNarratorSettings, useNarratorSupported } from "@/narrator";

export const SHOW = showJson;

// ---------- line player ----------
/**
 * Lines appear one at a time with a typewriter. Tap (or Enter/Space) finishes the current line;
 * tapping again advances. After a short pause it also advances on its own. Shows the last 3 lines.
 */
/**
 * Types lines one at a time. With `narrate` (question screens, PRD v5) each line starts typing when its utterance
 * starts, and the next line waits for the voice; if the voice ends first, the line completes at once. Off, muted or
 * unsupported speech falls straight back to the normal text-speed behaviour.
 */
export function LinePlayer({ lines, onDone, big, narrate, preface = [] }: { lines: string[]; onDone?: () => void; big?: boolean; narrate?: boolean | number; preface?: string[] }) {
  const { textSpeed, skipAnimations } = useSettings();
  const voice = useNarratorSettings();
  const instant = textSpeed === "instant" || skipAnimations;
  // `narrate` may name the first line to speak, so a host's lead-in is shown but only the question is read.
  const from = narrate === true ? 0 : typeof narrate === "number" ? Math.min(narrate, lines.length - 1) : -1;
  const speaks = from >= 0 && voice.on;
  const [i, setI] = useState(0);
  const [chars, setChars] = useState(instant ? Infinity : 0);
  // Narration: "pending" before the first spoken line, "waiting" until its utterance starts (1.5s fallback), then "on".
  const [narration, setNarration] = useState<"off" | "pending" | "waiting" | "on">(speaks ? (from > 0 ? "pending" : "waiting") : "off");
  const [voiced, setVoiced] = useState(-1); // last line whose utterance ended
  const done = useRef(false);
  const line = lines[i] ?? "";
  const typed = chars >= line.length;
  const last = i >= lines.length - 1;
  const narrating = narration === "on";
  const key = lines.join("|");

  useEffect(() => {
    setI(0);
    setChars(instant ? Infinity : 0);
    done.current = false;
    setVoiced(-1);
    setNarration(speaks ? (from > 0 ? "pending" : "waiting") : "off");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, speaks, from]);

  // Start speaking when the first spoken line comes up.
  const speakingStarted = narration === "waiting" || narration === "on";
  useEffect(() => {
    if (narration === "pending" && i === from) setNarration("waiting");
  }, [narration, i, from]);
  useEffect(() => {
    if (!speakingStarted) return;
    let started = false;
    let detached = false;
    // A run that has been cleaned up (unmount, or React running effects twice in development) must never touch
    // state: its late "nothing was spoken" used to switch narration off and cancel the live run.
    let active = true;
    const n = narrator();
    // If the first clip is slow (a network voice), the text carries on by itself, but the voice keeps reading.
    const fallback = setTimeout(() => {
      if (!started) {
        detached = true;
        setNarration("off");
      }
    }, 4000);
    // `preface`: spoken first but not shown in the lines (e.g. the host's reaction or a round title).
    const p = from === 0 ? preface.length : 0;
    void n
      .speakLines([...(p ? preface : []), ...lines.slice(from)], {
        onLineStart: (k) => {
          if (!active) return;
          started = true;
          if (detached || k < p) return; // text already moved on, or still on the preface
          setNarration("on");
          setI(from + k - p);
          setChars(instant ? Infinity : 0);
        },
        onLineEnd: (k) => {
          if (!active || detached || k < p) return;
          setVoiced(from + k - p);
          setI((cur) => {
            if (cur === from + k - p) setChars(Infinity); // the voice finished first: complete the line now
            return cur;
          });
        },
      })
      .then(() => {
        if (active && !started) setNarration("off");
      });
    return () => {
      active = false;
      clearTimeout(fallback);
      if (!detached) n.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakingStarted, key]);

  useEffect(() => {
    if (typed || narration === "waiting") return;
    const t = setTimeout(() => setChars((c) => c + 1), CHAR_MS[textSpeed]);
    return () => clearTimeout(t);
  }, [chars, typed, textSpeed, narration]);

  useEffect(() => {
    if (!typed || narration === "waiting") return;
    // While narrating, the voice paces the lines: the next one starts on its utterance, and done waits for the last.
    if (narrating) {
      if (last && voiced >= i && !done.current) {
        done.current = true;
        onDone?.();
      }
      return;
    }
    if (last) {
      if (!done.current) {
        done.current = true;
        onDone?.();
      }
      return;
    }
    const t = setTimeout(() => {
      setI((x) => x + 1);
      setChars(instant ? Infinity : 0);
    }, instant ? 0 : LINE_PAUSE_MS[textSpeed]);
    return () => clearTimeout(t);
  }, [typed, last, instant, textSpeed, onDone, narration, narrating, voiced, i]);

  const tap = () => {
    if (!typed) setChars(Infinity);
    else {
      // Advancing past a line stops the voice; the rest plays as normal text.
      if (narration !== "off") {
        narrator().cancel();
        setNarration("off");
      }
      if (!last) {
        setI(i + 1);
        setChars(instant ? Infinity : 0);
      }
    }
  };

  // Screens hold at most 3 lines (text rule), so all of them are laid out from the start: past lines visible,
  // the current line typed over an invisible copy of its remainder, future lines invisible. The box never grows.
  const start = Math.max(0, Math.min(i - 2, lines.length - 3));
  const view = lines.slice(start, start + 3);
  return (
    <div
      className={`lines ${big ? "big" : ""}`}
      role="button"
      tabIndex={0}
      aria-label="Tap to continue"
      onClick={tap}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          tap();
        }
      }}
    >
      {view.map((l, k) => {
        const n = start + k;
        if (n < i)
          return (
            <p key={n} className="line past">
              {l}
            </p>
          );
        if (n > i)
          return (
            <p key={n} className="line untyped" aria-hidden="true">
              {l}
            </p>
          );
        return (
          <p key={n} className="line now" aria-hidden="true">
            {l.slice(0, chars)}
            {!typed && <span className="caret">▌</span>}
            <span className="untyped">{l.slice(chars)}</span>
          </p>
        );
      })}
      <span className="sr-only" aria-live="polite">
        {line}
      </span>
      {typed && !last && <span className="more" aria-hidden="true"><Icon name="chevron-down" /></span>}
    </div>
  );
}

// ---------- host ----------
/** The host's speech bubble. Everything the host says is read aloud (narrate defaults to on). */
export function Host({ lines, onDone, mood, narrate = true, preface }: { lines: string[]; onDone?: () => void; mood?: "happy" | "sad"; narrate?: boolean | number; preface?: string[] }) {
  return (
    <div className={`host ${mood ?? ""}`}>
      <div className="host-sprite" aria-hidden="true">
        <HostAvatar scale={4} />
        <span className="host-name pixel">{SHOW.host.name}</span>
      </div>
      <div className="bubble-host">
        <LinePlayer lines={lines} onDone={onDone} big narrate={narrate} preface={preface} />
      </div>
    </div>
  );
}

// ---------- title card ----------
export function TitleCard({ number, title, intro, onGo }: { number?: number; title: string; intro: string[]; onGo: () => void }) {
  const { still } = useSettings();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    play("roundStart");
  }, []);
  return (
    <section className={`title-card-show ${still ? "still" : ""}`}>
      <div className="card-banner">
        {number !== undefined && <div className="pixel round-no">Round {number}</div>}
        <h2 className="round-title">{title}</h2>
      </div>
      <Host lines={intro} onDone={() => setReady(true)} preface={[number !== undefined ? `Round ${number}: ${title}.` : `${title}.`]} />
      <div className="choices">
        <button className="btn big" disabled={!ready} onClick={onGo} autoFocus={ready}>
          Let&apos;s play <Icon name="chevron-right" />
        </button>
      </div>
    </section>
  );
}

// ---------- numbers ----------
/** Short chip text, e.g. "CMHC · Oct 2025"; the full geography, period and cell stay in the tooltip and the source. */
export function chipLabel(f: Pick<Field<unknown>, "status" | "geography" | "reference_period" | "source_url">): string {
  if (f.status === "player_input") return "your input";
  if (f.status !== "measured" && f.status !== "derived") return f.status;
  const ref = `${f.geography} ${f.reference_period} ${f.source_url ?? ""}`;
  const src = /cmhc/i.test(ref) ? "CMHC" : /census|profile/i.test(ref) ? "Census" : /ttc/i.test(ref) ? "TTC" : /rentsafe|apartment building eval|4ef82789/i.test(ref) ? "RentSafeTO" : /anti-fraud|antifraud/i.test(ref) ? "Anti-Fraud Centre" : /ontario/i.test(ref) ? "Ontario" : "";
  const year = f.reference_period.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\w*\.? (\d{4})/)?.slice(1, 3).join(" ") ?? f.reference_period.match(/\d{4}/)?.[0] ?? "";
  return [f.status === "derived" ? "derived" : "", src, year].filter(Boolean).join(" · ") || f.status;
}

export function ProvChip({ f }: { f: Pick<Field<unknown>, "status" | "geography" | "reference_period" | "source_url" | "source_ref"> }) {
  const label = chipLabel(f);
  const title = [f.status, f.geography, f.reference_period, f.source_ref].filter(Boolean).join(" · ");
  return f.source_url ? (
    <a className={`prov ${f.status}`} href={f.source_url} target="_blank" rel="noreferrer" title={`${title} (opens source)`}>
      {label} <Icon name="external-link" />
    </a>
  ) : (
    <span className={`prov ${f.status}`} title={title} tabIndex={0}>
      {label}
    </span>
  );
}

export function Counter({ label, value, format, f }: { label: string; value: number | null; format: (n: number) => string; f: Parameters<typeof ProvChip>[0]["f"] }) {
  const { still } = useSettings();
  const [shown, setShown] = useState(still || value === null ? value : 0);
  useEffect(() => {
    if (value === null || still) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      setShown(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, still]);
  return (
    <div className="counter">
      <div className="counter-label">{label}</div>
      <div className="counter-value pixel" aria-label={value === null ? `${label}: unknown` : `${label}: ${format(value)}`}>
        <span className="cv-ghost" aria-hidden="true">
          {value === null ? "Unknown" : format(value)}
        </span>
        <span className="cv-live" aria-hidden="true">
          {shown === null ? "Unknown" : format(value !== null && shown === value ? value : shown)}
        </span>
      </div>
      <ProvChip f={f} />
    </div>
  );
}

// ---------- why drawer ----------
/** "Why? · Source" opens an overlay, so nothing behind it moves (audit A6). */
export function Why({ ids, extra }: { ids?: string[]; extra?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <>
      <button className="btn ghost small" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Why? · Source
      </button>
      {open && (
        <div className="why-overlay" onClick={() => setOpen(false)}>
          <div className="drawer" role="dialog" aria-modal="true" aria-label="Why? and sources" onClick={(e) => e.stopPropagation()}>
            {extra}
            {ids?.map((id) => {
              const c = content(id);
              return (
                <div key={id} className="drawer-item">
                  <p>{c.claim}</p>
                  <p className="note">
                    Source:{" "}
                    <a href={c.source_url} target="_blank" rel="noreferrer">
                      {c.source_title}
                    </a>{" "}
                    (checked {c.retrieved})
                  </p>
                </div>
              );
            })}
            <p className="note">{CONTENT_DISCLAIMER}</p>
            <button className="btn small" autoFocus onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- choices ----------
/** Re-reads the question and its options (PRD v5), by button or the R key. Hidden when speech can't work here. */
export function ReplayButton({ lines, options, onOption, disabled }: { lines: string[]; options: string[]; onOption: (i: number) => void; disabled?: boolean }) {
  const supported = useNarratorSupported();
  const { on } = useNarratorSettings();
  const replay = useCallback(() => {
    const n = narrator();
    n.cancel();
    void n.speakLines(lines).then(() => n.speakOptions(options, { onOptionStart: onOption }));
  }, [lines, options, onOption]);
  useEffect(() => {
    if (!supported || !on || disabled) return;
    const key = (e: KeyboardEvent) => {
      if ((e.key === "r" || e.key === "R") && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) replay();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [supported, on, disabled, replay]);
  if (!supported || !on) return null;
  return (
    <button className="btn ghost skip-btn" disabled={disabled} onClick={replay} aria-keyshortcuts="R" title="Read it again (R)">
      <Icon name="volume-3" /> Replay
    </button>
  );
}

/** Skip, by button or the S key (PRD v4 Change 3). `locked` shares the answer lock, so it can't double-fire. */
export function SkipButton({ onSkip, disabled, label = "Skip" }: { onSkip: () => void; disabled?: boolean; label?: string }) {
  const done = useRef(false);
  const fire = useCallback(() => {
    if (done.current || disabled) return;
    done.current = true;
    onSkip();
  }, [onSkip, disabled]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === "s" || e.key === "S") && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) fire();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [fire]);
  return (
    <button className="btn ghost skip-btn" disabled={disabled} onClick={fire} aria-keyshortcuts="S" title="Skip (S)">
      {label} <Icon name="next" />
    </button>
  );
}

export function Choices({
  options,
  onPick,
  onSkip,
  disabled,
  narrate,
}: {
  options: { id: string; label: string; hidden?: boolean }[];
  onPick: (id: string) => void;
  onSkip?: () => void;
  disabled?: boolean;
  /** Read the options aloud once enabled (PRD v5); `lines` is the question, for Replay. */
  narrate?: { lines: string[] };
}) {
  // Locks on the first pick or skip so a fast double tap can't answer twice (audit A7).
  const [locked, setLocked] = useState(false);
  const [reading, setReading] = useState(-1);
  const optionKey = options.map((o) => o.id).join("|");
  const shown = options.filter((o) => !o.hidden);
  useEffect(() => setLocked(false), [optionKey]);
  // Once the question is on screen, read the options; answering or leaving stops the voice.
  useEffect(() => {
    if (!narrate || disabled || locked) return;
    const n = narrator();
    let active = true;
    void n.speakOptions(
      shown.map((o) => o.label),
      { onOptionStart: (i) => active && setReading(i) },
    );
    return () => {
      active = false;
      n.cancel();
      setReading(-1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!narrate, disabled, locked, optionKey]);
  const stopVoice = () => {
    if (narrate) narrator().cancel();
    setReading(-1);
  };
  return (
    <>
      <div className={`choices n${shown.length}`}>
        {shown.map((o, k) => (
            <button
              key={o.id}
              className={`btn choice-big ${reading === k ? "reading" : ""}`}
              disabled={disabled || locked}
              onClick={() => {
                if (locked) return;
                setLocked(true);
                stopVoice();
                onPick(o.id);
              }}
            >
              {o.label}
            </button>
          ))}
      </div>
      {(onSkip || narrate) && (
        <div className="skip-row">
          {narrate && <ReplayButton lines={narrate.lines} options={shown.map((o) => o.label)} onOption={setReading} disabled={locked} />}
          {onSkip && (
            <SkipButton
              key={optionKey}
              disabled={disabled || locked}
              onSkip={() => {
                setLocked(true);
                stopVoice();
                onSkip();
              }}
            />
          )}
        </div>
      )}
    </>
  );
}

// ---------- reveal ----------
/** Pause, drumroll, big result, then the lesson. Correct/wrong is shown by icon AND word, not colour alone. */
export function Reveal(props: {
  ok: boolean | null;
  headline?: React.ReactNode;
  lines: string[];
  why?: string[];
  whyExtra?: React.ReactNode;
  points?: number;
  onNext: () => void;
  nextLabel?: React.ReactNode;
  /** Question id whose sourced stat card (if any) shows after this feedback. */
  stat?: string;
  /** A skipped question: shows the answer in one line, then continues by itself (tap Next to go now). */
  skipped?: boolean;
}) {
  const { ok, headline, lines, why, whyExtra, points, onNext, nextLabel, stat, skipped } = props;
  const [statCard, next] = useStatGate(stat, onNext);
  const { still } = useSettings();
  const [stage, setStage] = useState<"drum" | "show">(still || skipped ? "show" : "drum");
  const [linesDone, setLinesDone] = useState(false);
  useEffect(() => {
    if (stage === "drum") {
      play("reveal");
      const t = setTimeout(() => setStage("show"), 550);
      return () => clearTimeout(t);
    }
    if (skipped) play("skip");
    else if (ok === true) play("correct");
    else if (ok === false) play("wrong");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);
  useEffect(() => {
    if (!skipped || !linesDone || statCard) return;
    const t = setTimeout(next, 1800);
    return () => clearTimeout(t);
  }, [skipped, linesDone, statCard, next]);
  if (stage === "drum") return <div className="reveal-drum pixel" aria-live="polite"><Icon name="music" /> …</div>;
  return (
    <div className={`reveal ${ok === true ? "good" : ok === false ? "bad" : ""} ${still ? "still" : ""}`}>
      <div className="reveal-big pixel" role="status">
        {(skipped || ok !== null) && <Icon name={skipped ? "next" : ok ? "check" : "close"} />} {skipped ? "Skipped" : ok === true ? "Correct!" : ok === false ? "Wrong!" : ""} {headline && <span className="reveal-head">{headline}</span>}
        {!!points && points > 0 && <span className="points-fly">+{points}</span>}
      </div>
      <LinePlayer
        lines={lines}
        onDone={() => setTimeout(() => setLinesDone(true), 250)}
        big
        narrate
        // Read only the verdict word; the headline and any host reaction are not spoken.
        preface={skipped ? ["Skipped."] : ok === true ? ["Correct!"] : ok === false ? ["Wrong!"] : []}
      />
      <div className="reveal-actions">
        {(why?.length || whyExtra) && <Why ids={why} extra={whyExtra} />}
        <button className="btn big" disabled={!linesDone || !!statCard} onClick={next} autoFocus={linesDone}>
          {nextLabel ?? <>Next <Icon name="chevron-right" /></>}
        </button>
      </div>
      {statCard}
    </div>
  );
}

// ---------- confetti ----------
export function Confetti() {
  const { still } = useSettings();
  if (still) return null;
  const colors = ["#f2b136", "#ff4fd8", "#24e0ff", "#3aa26a", "#e0505e"];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 40 }).map((_, i) => (
        <span key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 10) * 0.08}s`, animationDuration: `${1.4 + (i % 5) * 0.25}s` }} />
      ))}
    </div>
  );
}
