"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "@/game/outcome";
import type { Difficulty, NegotiatedTerms, Offer } from "@/game/types";
import { Badge } from "./pixel";

interface Turn {
  role: "player" | "landlord";
  text: string;
  source?: "llm" | "scripted";
  note?: string;
}

interface ServerReply {
  message: string;
  source: "llm" | "scripted";
  fallbackReason?: string;
  adjustments: string[];
  rentCents: number;
  askingCents: number;
  concessions: { id: string; label: string; monetary: boolean }[];
  status: "open" | "final" | "ended";
  turnsLeft: number;
  strength: number;
  strongAt: number;
  strong: boolean;
  legalHelp: { title: string; url: string } | null;
}

const CHIPS = [
  "The CMHC average rent for this kind of unit in this area is lower than yours.",
  "I've seen another place that's comparable and cheaper.",
  "I have a stable full-time job and great references.",
  "I'm flexible on the move-in date.",
  "I'd sign an 18-month lease.",
  "I'm ready to sign this week.",
  "Could utilities be included in the rent?",
  "Could you come down a little on the rent?",
];

export function Negotiation(props: {
  stageId: string;
  offer: Offer;
  difficulty: Difficulty;
  scripted: boolean;
  /** The game seed: the server re-rolls the same location and rent (src/game/locations.ts). */
  seed?: number;
  onAccept: (terms: NegotiatedTerms) => void;
  onWalk: () => void;
}) {
  const { stageId, offer, difficulty, scripted, seed, onAccept, onWalk } = props;
  const [landlord, setLandlord] = useState("The landlord");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [last, setLast] = useState<ServerReply | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/negotiate?stageId=${stageId}&offerId=${offer.id}${seed !== undefined ? `&seed=${seed}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        setLandlord(d.landlord);
        setTurns([{ role: "landlord", text: d.opening, source: "scripted" }]);
      })
      .catch(() => setError("Couldn't reach the landlord. You can still sign at the listed terms."));
  }, [stageId, offer.id, seed]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy || last?.status === "ended" || last?.status === "final") return;
    const next: Turn[] = [...turns, { role: "player", text: msg }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/negotiate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stageId,
          offerId: offer.id,
          difficulty,
          seed,
          mode: scripted ? "scripted" : "auto",
          transcript: next.map(({ role, text }) => ({ role, text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Negotiation failed");
      setLast(data);
      setTurns([...next, { role: "landlord", text: data.message, source: data.source, note: data.fallbackReason }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Negotiation failed");
    } finally {
      setBusy(false);
    }
  }

  const rent = last?.rentCents ?? offer.rentCents;
  const concessions = last?.concessions ?? [];
  const closed = last?.status === "ended";
  const terms: NegotiatedTerms = {
    rentCents: rent,
    askingCents: offer.rentCents,
    utilitiesIncluded: concessions.some((c) => c.id === "utilities-included"),
    concessions: concessions.map(({ id, label }) => ({ id, label })),
  };

  return (
    <div className="paper">
      <span className="eyebrow">Negotiate (optional)</span>
      <h2>Talk to {landlord}</h2>
      <p className="small muted">
        The landlord is fictional. {scripted ? "This conversation uses the scripted landlord." : "Their wording may be written by an AI model (Gemini)."} Game code alone decides
        the price and any extras; nothing you type can change those rules. The landlord can&apos;t give legal advice.
      </p>

      <div className="chat" ref={logRef} aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.role}`}>
            <span className="who">{t.role === "player" ? "You" : landlord}</span>
            {t.text}
            {t.role === "landlord" && i > 0 && (
              <span className="via">
                {t.source === "llm" ? "worded by Gemini, terms set by code" : `scripted${t.note ? ` (${t.note})` : ""}`}
              </span>
            )}
          </div>
        ))}
        {busy && <div className="bubble landlord typing">…</div>}
      </div>

      {last?.legalHelp && (
        <p className="small">
          Rules about deposits, rent increases and evictions are set by the Province:{" "}
          <a href={last.legalHelp.url} target="_blank" rel="noreferrer">
            {last.legalHelp.title}
          </a>
        </p>
      )}

      <div className="deal">
        <div>
          Current terms: <b>{money(rent)}/mo</b>
          <Badge f={{ status: "illustrative", geography: "Fictional scenario", reference_period: last ? "illustrative — negotiated" : "listed", source_url: null }} />
          {rent !== offer.rentCents && <span className="small"> (listed {money(offer.rentCents)})</span>}
          {concessions.length > 0 && <div className="small">Extras: {concessions.map((c) => c.label).join(", ")}</div>}
        </div>
        <div className="case-meter" title="Each kind of solid argument adds to your case. A strong case unlocks extra room on the rent.">
          <span className="small">{last?.strong ? "Strong case: extra room unlocked" : "Your case"}</span>
          <span className="pips" aria-label={`Case strength ${last?.strength ?? 0} of ${last?.strongAt ?? "?"}`}>
            {Array.from({ length: last?.strongAt ?? 4 }).map((_, i) => (
              <span key={i} className={i < (last?.strength ?? 0) ? "on" : ""} />
            ))}
          </span>
        </div>
        <div className="small muted">
          {last ? (last.status === "open" ? `${last.turnsLeft} message${last.turnsLeft === 1 ? "" : "s"} before a final offer` : last.status === "final" ? "Final offer" : "Conversation ended") : ""}
        </div>
      </div>

      {!closed && last?.status !== "final" && (
        <>
          <div className="row" style={{ margin: "10px 0" }}>
            {CHIPS.map((c) => (
              <button key={c} className="choice talk" disabled={busy} onClick={() => send(c)}>
                {c}
              </button>
            ))}
          </div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <input className="field-input chat-input" value={draft} maxLength={400} placeholder="Write your own message…" onChange={(e) => setDraft(e.target.value)} disabled={busy} />
            <button className="btn blue small" disabled={busy || !draft.trim()}>
              Send
            </button>
          </form>
        </>
      )}
      {error && <p className="no small">{error}</p>}

      <div className="row" style={{ marginTop: 12 }}>
        {!closed && (
          <button className="btn green" disabled={busy} onClick={() => onAccept(terms)}>
            Accept {money(rent)}/mo{concessions.length ? " + extras" : ""}
          </button>
        )}
        <button className="btn ghost" disabled={busy} onClick={onWalk}>
          Walk away
        </button>
      </div>
    </div>
  );
}
