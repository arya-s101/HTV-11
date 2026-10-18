"use client";

// Stat cards (PRD v3 Change 4): answer → feedback → one big, sourced number → next question.
// Skippable by button, tap anywhere, Space or Enter; auto-advances unless held; "Show stats: off" removes them.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { formatStat, statFor, unitWord, type StatCard as Card } from "@/game/stats";
import { ProvChip } from "./primitives";
import { useSettings } from "./settings";

// ---------- one run's memory of which figures were already shown ----------
const RunCtx = createContext<{ current: string[] } | null>(null);

export function StatRun({ children }: { children: React.ReactNode }) {
  const shown = useRef<string[]>([]);
  return <RunCtx.Provider value={shown}>{children}</RunCtx.Provider>;
}

/**
 * Wraps a "next" action: if this question has an unseen sourced stat (and stats are on), the card shows first.
 * Returns the card element to render (or null) and the wrapped action.
 */
/** Takes the next unseen card for this question and remembers its group for the run. Null if stats are off or none remain. */
export function useTakeStat() {
  const shown = useContext(RunCtx);
  const { showStats } = useSettings();
  return useCallback((questionId: string): Card | null => {
    const c = showStats && shown ? statFor(questionId, shown.current) : null;
    if (c && shown) shown.current = [...shown.current, c.group];
    return c;
  }, [showStats, shown]);
}

export function useStatGate(questionId: string | undefined, next: () => void): [React.ReactNode, () => void] {
  const shown = useContext(RunCtx);
  const { showStats } = useSettings();
  const [card, setCard] = useState<Card | null>(null);
  const go = useCallback(() => {
    const c = questionId && showStats && shown ? statFor(questionId, shown.current) : null;
    if (!c) return next();
    shown!.current = [...shown!.current, c.group];
    setCard(c);
  }, [questionId, showStats, shown, next]);
  return [card ? <StatCardView card={card} onDone={next} /> : null, go];
}

// ---------- the card ----------
export function StatCardView({ card, onDone }: { card: Card; onDone: () => void }) {
  const { still, statMs } = useSettings();
  const [hold, setHold] = useState(false);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(still ? card.stat.value : 0);
  const done = useRef(false);
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    onDone();
  }, [onDone]);

  // A short arm delay so the press that opened the card can't also close it.
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 300);
    return () => clearTimeout(t);
  }, []);
  // Auto-advance, paused while held or while the tab is hidden.
  useEffect(() => {
    if (hold) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(t);
      if (!document.hidden) t = setTimeout(finish, statMs);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [hold, statMs, finish]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!armed || (e.key !== " " && e.key !== "Enter")) return;
      e.preventDefault();
      finish();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [armed, finish]);
  // Gentle count-up; static under reduced motion.
  useEffect(() => {
    if (still) return setShown(card.stat.value);
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      setShown(card.stat.value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [card, still]);

  const { stat, compare_to: cmp } = card;
  const final = formatStat(stat.value, stat.unit);
  const live = shown === stat.value ? final : formatStat(stat.unit === "%" ? Math.round(shown * 10) / 10 : shown, stat.unit);
  const max = cmp ? Math.max(stat.value, cmp.value) : 0;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div className="stat-overlay" onClick={() => armed && finish()} role="dialog" aria-modal="true" aria-label={`Stat: ${card.label}`}>
      <div className={`stat-card ${still ? "still" : ""}`}>
        <div className="stat-kicker pixel">The real numbers</div>
        <div className="stat-number" aria-label={final}>
          <span className="cv-ghost" aria-hidden="true">
            {final}
          </span>
          <span className="cv-live" aria-hidden="true">
            {live}
          </span>
        </div>
        {unitWord(stat.unit) && <div className="stat-unit">{unitWord(stat.unit)}</div>}
        <p className="stat-label">{card.label}</p>
        {cmp && (
          <div className="stat-bars" aria-hidden="true">
            {[
              [card.stat_label ?? "This", stat],
              [card.compare_label ?? "Compare", cmp],
            ].map(([label, f]) => {
              const field = f as typeof stat;
              return (
                <div key={label as string} className="stat-bar-row">
                  <span className="stat-bar-label">{label as string}</span>
                  <span className="stat-bar-track">
                    <span className="stat-bar-fill" style={{ width: `${Math.max(4, (field.value / max) * 100)}%` }} />
                  </span>
                  <span className="stat-bar-value">{formatStat(field.value, field.unit)}</span>
                </div>
              );
            })}
          </div>
        )}
        {cmp && (
          <p className="sr-only">
            {card.stat_label}: {final}. {card.compare_label}: {formatStat(cmp.value, cmp.unit)} ({cmp.geography}, {cmp.reference_period}).
          </p>
        )}
        <p className="stat-where">
          {stat.geography} · {stat.reference_period}
        </p>
        <div className="stat-actions" onClick={stop}>
          <ProvChip f={stat} />
          <button className={`btn ghost small ${hold ? "on" : ""}`} onClick={() => setHold(!hold)} aria-pressed={hold}>
            {hold ? "▶ Resume" : "❚❚ Hold"}
          </button>
          <button className="btn small" onClick={() => armed && finish()} autoFocus>
            Skip ▶
          </button>
        </div>
        {!hold && !still && <div className="stat-timer" style={{ animationDuration: `${statMs}ms` }} aria-hidden="true" />}
        <p className="stat-hint small">{hold ? "Held. Take your time." : "Tap anywhere, Space or Enter to continue"}</p>
      </div>
    </div>
  );
}
