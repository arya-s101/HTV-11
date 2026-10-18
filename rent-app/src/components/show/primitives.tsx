"use client";

// Game-show building blocks. Phases supply lines and choices; these own the layout and the juice.
import { useEffect, useRef, useState } from "react";
import showJson from "../../../data/game/show.json";
import { content, CONTENT_DISCLAIMER } from "@/game/journey";
import type { Field } from "@/game/types";
import { HostAvatar } from "./HostAvatar";
import { CHAR_MS, LINE_PAUSE_MS, useSettings, useSfx } from "./settings";
import { useStatGate } from "./StatCard";

export const SHOW = showJson;

// ---------- line player ----------
/**
 * Lines appear one at a time with a typewriter. Tap (or Enter/Space) finishes the current line;
 * tapping again advances. After a short pause it also advances on its own. Shows the last 3 lines.
 */
export function LinePlayer({ lines, onDone, big }: { lines: string[]; onDone?: () => void; big?: boolean }) {
  const { textSpeed, skipAnimations } = useSettings();
  const instant = textSpeed === "instant" || skipAnimations;
  const [i, setI] = useState(0);
  const [chars, setChars] = useState(instant ? Infinity : 0);
  const done = useRef(false);
  const line = lines[i] ?? "";
  const typed = chars >= line.length;
  const last = i >= lines.length - 1;

  useEffect(() => {
    setI(0);
    setChars(instant ? Infinity : 0);
    done.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.join("|")]);

  useEffect(() => {
    if (typed) return;
    const t = setTimeout(() => setChars((c) => c + 1), CHAR_MS[textSpeed]);
    return () => clearTimeout(t);
  }, [chars, typed, textSpeed]);

  useEffect(() => {
    if (!typed) return;
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
  }, [typed, last, instant, textSpeed, onDone]);

  const tap = () => {
    if (!typed) setChars(Infinity);
    else if (!last) {
      setI(i + 1);
      setChars(instant ? Infinity : 0);
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
      {typed && !last && <span className="more" aria-hidden="true">▼</span>}
    </div>
  );
}

// ---------- host ----------
export function Host({ lines, onDone, mood }: { lines: string[]; onDone?: () => void; mood?: "happy" | "sad" }) {
  return (
    <div className={`host ${mood ?? ""}`}>
      <div className="host-sprite" aria-hidden="true">
        <HostAvatar scale={4} />
        <span className="host-name pixel">{SHOW.host.name}</span>
      </div>
      <div className="bubble-host">
        <LinePlayer lines={lines} onDone={onDone} big />
      </div>
    </div>
  );
}

// ---------- title card ----------
export function TitleCard({ number, title, intro, onGo, onSkip, skipLabel }: { number?: number; title: string; intro: string[]; onGo: () => void; onSkip?: () => void; skipLabel?: string }) {
  const { still } = useSettings();
  const sfx = useSfx();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    sfx.fanfare();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className={`title-card-show ${still ? "still" : ""}`}>
      <div className="card-banner">
        {number !== undefined && <div className="pixel round-no">Round {number}</div>}
        <h2 className="round-title">{title}</h2>
      </div>
      <Host lines={intro} onDone={() => setReady(true)} />
      <div className="choices">
        <button className="btn big" disabled={!ready} onClick={onGo} autoFocus={ready}>
          Let&apos;s play ▶
        </button>
        {onSkip && (
          <button className="btn ghost" disabled={!ready} onClick={onSkip}>
            {skipLabel ?? "Skip this round"}
          </button>
        )}
      </div>
    </section>
  );
}

// ---------- numbers ----------
/** Short chip text, e.g. "CMHC · Oct 2025"; the full geography, period and cell stay in the tooltip and the source. */
export function chipLabel(f: Pick<Field<unknown>, "status" | "geography" | "reference_period" | "source_url">): string {
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
      {label} ↗
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
export function Choices({ options, onPick, disabled }: { options: { id: string; label: string; hidden?: boolean }[]; onPick: (id: string) => void; disabled?: boolean }) {
  // Locks on the first pick so a fast double tap can't answer twice (audit A7).
  const [locked, setLocked] = useState(false);
  const optionKey = options.map((o) => o.id).join("|");
  useEffect(() => setLocked(false), [optionKey]);
  return (
    <div className={`choices n${options.filter((o) => !o.hidden).length}`}>
      {options
        .filter((o) => !o.hidden)
        .map((o) => (
          <button
            key={o.id}
            className="btn choice-big"
            disabled={disabled || locked}
            onClick={() => {
              if (locked) return;
              setLocked(true);
              onPick(o.id);
            }}
          >
            {o.label}
          </button>
        ))}
    </div>
  );
}

// ---------- reveal ----------
/** Pause, drumroll, big result, then the lesson. Correct/wrong is shown by icon AND word, not colour alone. */
export function Reveal(props: {
  ok: boolean | null;
  headline?: string;
  lines: string[];
  why?: string[];
  whyExtra?: React.ReactNode;
  points?: number;
  onNext: () => void;
  nextLabel?: string;
  /** Question id whose sourced stat card (if any) shows after this feedback. */
  stat?: string;
  /** Extra block under the result, still on the game screen (used for the scam-help steps). */
  footer?: React.ReactNode;
}) {
  const { ok, headline, lines, why, whyExtra, points, onNext, nextLabel, stat, footer } = props;
  const [statCard, next] = useStatGate(stat, onNext);
  const { still } = useSettings();
  const sfx = useSfx();
  const [stage, setStage] = useState<"drum" | "show">(still ? "show" : "drum");
  const [linesDone, setLinesDone] = useState(false);
  useEffect(() => {
    if (stage === "drum") {
      sfx.drum(500);
      const t = setTimeout(() => setStage("show"), 550);
      return () => clearTimeout(t);
    }
    if (ok === true) sfx.chime();
    else if (ok === false) sfx.buzzer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);
  if (stage === "drum") return <div className="reveal-drum pixel" aria-live="polite">🥁 …</div>;
  const quips = ok === true ? SHOW.reactions.correct : ok === false ? SHOW.reactions.wrong : [];
  return (
    <div className={`reveal ${ok === true ? "good" : ok === false ? "bad" : ""} ${still ? "still" : ""}`}>
      <div className="reveal-big pixel" role="status">
        {ok === true ? "✓ Correct!" : ok === false ? "✗ Not quite" : ""} {headline && <span className="reveal-head">{headline}</span>}
        {!!points && points > 0 && <span className="points-fly">+{points}</span>}
      </div>
      {quips.length > 0 && <p className="quip">{SHOW.host.name}: “{quips[(lines.join("").length + (headline?.length ?? 0)) % quips.length]}”</p>}
      <LinePlayer lines={lines} onDone={() => setTimeout(() => setLinesDone(true), 250)} big />
      {footer}
      <div className="reveal-actions">
        {(why?.length || whyExtra) && <Why ids={why} extra={whyExtra} />}
        <button className="btn big" disabled={!linesDone || !!statCard} onClick={next} autoFocus={linesDone}>
          {nextLabel ?? "Next ▶"}
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

// ---------- timer ----------
export function useCountdown(seconds: number, running: boolean, onEnd: () => void) {
  const [left, setLeft] = useState(seconds);
  const ended = useRef(false);
  useEffect(() => {
    setLeft(seconds);
    ended.current = false;
  }, [seconds]);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const v = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, []);
  useEffect(() => {
    if (!running || hidden) return;
    if (left <= 0) {
      if (!ended.current) {
        ended.current = true;
        onEnd();
      }
      return;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, running, hidden, onEnd]);
  return [left, setLeft] as const;
}

export function TimerBadge({ left, total }: { left: number; total: number }) {
  return (
    <div className={`timer-badge ${left <= Math.min(5, total / 3) ? "low" : ""}`} role="timer" aria-label={`${left} seconds left`}>
      <span className="pixel">⏱ {left}s</span>
      <span className="bar" style={{ width: `${(left / total) * 100}%` }} />
    </div>
  );
}
