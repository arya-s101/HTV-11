"use client";

// Party mode (PRD v4 Change 5): same questions at the same time on every device, host paces the reveals,
// scoreboard between questions. Only a display name and sprite are shared; no profile data, no timers.
import { Icon } from "@/components/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { MODES } from "@/config/modes";
import { STAGES } from "@/game/data";
import { content, listingsFor } from "@/game/journey";
import type { PlayableStage } from "@/game/types";
import { DEMO_CHARACTER, type Appearance } from "@/game/sprite";
import type { Difficulty } from "@/game/types";
import { DIFFICULTY_INFO } from "@/game/score";
import { firebaseProjectId } from "@/multiplayer/firebase";
import { advance, claimHostIfNeeded, lastStep, createRoom, heartbeat, joinRoom, leaveRoom, playAgain, readKey, reveal, setRoomOptions, startGame, submitAnswer, watchAnswers, watchPlayers, watchQuestion, watchRoom, type Answer, type Player, type Room } from "@/multiplayer/api";
import { money } from "@/game/outcome";
import { Negotiation } from "./Negotiation";
import { hagglePoints, isCode, normalizeCode, roomQuestions, roomScenarioIds, type AnswerKey, type RoomQuestion } from "@/multiplayer/room";
import { prefetchScenarios } from "./show/scenarios";
import { play } from "./audio";
import { Sprite } from "./pixel";
import { LISTING_CHOICES, ListingCard } from "./show/JourneyShow";
import { Choices, Host, LinePlayer, Reveal, SHOW, TitleCard } from "./show/primitives";
import { ShowSettingsProvider } from "./show/settings";
import { StatRun } from "./show/StatCard";

const POINTS = SHOW.points.answer;
const STAGE = STAGES.find((x) => x.journey)! as PlayableStage;
const sentences = (t: string) => t.match(/[^.!?]+[.!?]*["”']?/g)?.map((x) => x.trim()).filter(Boolean) ?? [t];

export function Multiplayer({ sprite, name, onExit }: { sprite: Appearance; name?: string; onExit: () => void }) {
  return (
    <ShowSettingsProvider>
      <StatRun>
        <Party sprite={sprite} defaultName={name ?? ""} onExit={onExit} />
      </StatRun>
    </ShowSettingsProvider>
  );
}

function Party({ sprite, defaultName, onExit }: { sprite: Appearance; defaultName: string; onExit: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const prevCount = useRef(0);

  useEffect(() => {
    if (!code) return;
    const a = watchRoom(code, setRoom);
    const b = watchPlayers(code, setPlayers);
    return () => (a(), b());
  }, [code]);
  useEffect(() => (code && uid ? heartbeat(code, uid) : undefined), [code, uid]);
  useEffect(() => {
    if (players.length > prevCount.current && prevCount.current > 0) play("joined");
    prevCount.current = players.length;
    if (code && uid && room) void claimHostIfNeeded(code, uid, room, players);
  }, [players, room, code, uid]);

  if (!code || !uid) return <Entry sprite={sprite} defaultName={defaultName} onIn={(c, u) => (setCode(c), setUid(u))} onExit={onExit} />;
  if (!room) return <p className="small">Connecting to room {code}…</p>;
  const isHost = room.hostUid === uid;
  const me = players.find((p) => p.uid === uid);
  const leave = () => {
    void leaveRoom(code, uid);
    onExit();
  };

  return (
    <div className="party">
      <div className="podium-bar">
        <div className="podium">
          <div className="podium-sprite">
            <Sprite appearance={me?.sprite ?? sprite} scale={3} />
          </div>
          <div>
            <div className="pixel podium-name">{me?.displayName ?? "You"}</div>
            <div className="small muted">
              Room {code} · {isHost ? "you're the host" : `host: ${players.find((p) => p.uid === room.hostUid)?.displayName ?? "…"}`}
            </div>
          </div>
        </div>
        <div className="score-box" aria-live="polite">
          <span className="small muted">Score</span>
          <span className="pixel score">{me?.score ?? 0}</span>
        </div>
        <div className="podium-actions">
          <button className="btn ghost small" onClick={leave}>
            Leave
          </button>
        </div>
      </div>
      {room.status === "lobby" && <Lobby room={room} players={players} isHost={isHost} />}
      {(room.status === "playing" || room.status === "reveal") && <Play room={room} players={players} uid={uid} isHost={isHost} />}
      {room.status === "finished" && <Finish room={room} players={players} uid={uid} isHost={isHost} onLeave={leave} />}
    </div>
  );
}

function Entry({ sprite, defaultName, onIn, onExit }: { sprite: Appearance; defaultName: string; onIn: (code: string, uid: string) => void; onExit: () => void }) {
  const [name, setName] = useState(defaultName);
  const [join, setJoin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const go = async (fn: () => Promise<{ code: string; uid: string } | { error: string }>) => {
    setBusy(true);
    setMsg(null);
    try {
      // Never hang silently: a missing database or blocked network otherwise retries forever.
      const r = await Promise.race([fn(), new Promise<never>((_, no) => setTimeout(() => no(new Error("timed out after 12s")), 12_000))]);
      if ("error" in r) setMsg(r.error);
      else onIn(r.code, r.uid);
    } catch (e) {
      const code = (e as { code?: string }).code;
      const why =
        code === "permission-denied"
          ? "the database rules refused it (deploy firestore.rules)"
          : code === "auth/admin-restricted-operation" || code === "auth/operation-not-allowed"
            ? "anonymous sign-in is off in Firebase Authentication"
            : e instanceof Error
              ? e.message
              : "unknown error";
      setMsg(`Couldn't start multiplayer while ${lastStep || "starting"}: ${why}. Project: ${firebaseProjectId()}. Single-player still works.`);
      console.warn("multiplayer", e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="page party-entry">
      <h1>Multiplayer</h1>
      <p className="lede">2–8 players, same questions, live scoreboard. Only your display name and sprite are shared.</p>
      <div className="row" style={{ alignItems: "center", gap: 12 }}>
        <Sprite appearance={sprite} scale={5} />
        <input className="field-input" value={name} maxLength={16} placeholder="Display name" onChange={(e) => setName(e.target.value)} aria-label="Display name" />
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn big" disabled={busy} onClick={() => go(() => createRoom(name, sprite))}>
          Create room
        </button>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <input className="field-input code-input" value={join} placeholder="ROOM CODE" onChange={(e) => setJoin(normalizeCode(e.target.value))} aria-label="Room code" />
        <button
          className="btn blue"
          disabled={busy || !isCode(join)}
          onClick={() =>
            go(async () => {
              const r = await joinRoom(join, name, sprite);
              return r.ok ? { code: join, uid: r.uid } : { error: r.reason };
            })
          }
        >
          Join
        </button>
      </div>
      {msg && <p className="bad-text">{msg}</p>}
      <button className="btn ghost small" onClick={onExit} style={{ marginTop: 16 }}>
        Back
      </button>
    </section>
  );
}

function PlayerList({ players, answered }: { players: Player[]; answered?: Set<string> }) {
  return (
    <ul className="party-players">
      {players.map((p) => (
        <li key={p.uid} className={p.connected ? "" : "away"}>
          <Sprite appearance={p.sprite ?? DEMO_CHARACTER.appearance} scale={2} />
          <span>{p.displayName}</span>
          <b className="pixel">{p.score}</b>
          {answered && <span>{answered.has(p.uid) ? <Icon name="check" label="answered" /> : "…"}</span>}
        </li>
      ))}
    </ul>
  );
}

function Lobby({ room, players, isHost }: { room: Room; players: Player[]; isHost: boolean }) {
  const [starting, setStarting] = useState(false);
  const start = async () => {
    setStarting(true);
    // Generic scenarios for everyone (no profiles in rooms); the reviewed fallbacks cover any gap.
    const ids = roomScenarioIds(room.seed, room.difficulty);
    const got: Record<string, { scenario: string }> = {};
    await prefetchScenarios([[...ids.listings.map((id) => ({ id, kind: (id.startsWith("s2-") ? "offer" : "listing") as "offer" | "listing" })), ...ids.questions.map((id) => ({ id, kind: "question" as const }))]], {}, (m) => Object.assign(got, m), room.code);
    const { questions, keys } = roomQuestions(room.seed, room.difficulty, got);
    await startGame(room.code, questions, keys);
  };
  return (
    <section className="beat">
      <h2 className="round-title">Lobby</h2>
      <p className="big-line">
        Share the code <b className="pixel">{room.code}</b>. {players.length} of 8 players.
      </p>
      <PlayerList players={players} />
      {isHost ? (
        <>
          <div className="seg">
            {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
              <button key={d} className={`choice ${room.difficulty === d ? "on" : ""}`} aria-pressed={room.difficulty === d} onClick={() => setRoomOptions(room.code, { difficulty: d })}>
                {DIFFICULTY_INFO[d].label}
              </button>
            ))}
          </div>
          <p className="small">Mode: Base game (Extended and haggling stay single-player for now).</p>
          <button className="btn big" disabled={starting || players.length < 1} onClick={start}>
            {starting ? "Writing questions…" : <>Start <Icon name="chevron-right" /></>}
          </button>
        </>
      ) : (
        <p className="small">Waiting for the host to start…</p>
      )}
    </section>
  );
}

function Play({ room, players, uid, isHost }: { room: Room; players: Player[]; uid: string; isHost: boolean }) {
  const index = room.currentQuestionIndex;
  const [q, setQ] = useState<RoomQuestion | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [mine, setMine] = useState<number | "skip" | null>(null);
  const [key, setKey] = useState<AnswerKey | null>(null);
  const [board, setBoard] = useState(false);
  const [ready, setReady] = useState(false);
  const [introDone, setIntroDone] = useState<string[]>([]);
  const revealing = useRef(false);
  // Every client rebuilds the same listings from the room seed, so the cards match the single-player game exactly.
  const listings = useMemo(() => listingsFor(STAGE, room.difficulty, room.seed, MODES.base.listings), [room.difficulty, room.seed]);

  useEffect(() => watchQuestion(room.code, index, setQ), [room.code, index]);
  useEffect(() => {
    setMine(null);
    setKey(null);
    setBoard(false);
    setReady(false);
    revealing.current = false;
  }, [index]);
  // The host watches answers live; others only once the reveal makes them readable (firestore.rules).
  useEffect(() => (isHost || room.status === "reveal" ? watchAnswers(room.code, setAnswers) : undefined), [room.code, isHost, room.status]);
  const current = answers.filter((a) => a.index === index);
  const connected = players.filter((p) => p.connected);
  // Auto-reveal once everyone connected has answered or skipped.
  useEffect(() => {
    if (!isHost || room.status !== "playing" || revealing.current || !connected.length) return;
    if (connected.every((p) => current.some((a) => a.uid === p.uid))) void doReveal();
  });
  useEffect(() => {
    if (room.status === "reveal") void readKey(room.code, index).then(setKey);
  }, [room.status, room.code, index]);

  async function doReveal() {
    if (revealing.current) return;
    revealing.current = true;
    const keys: AnswerKey[] = [];
    for (let i = 0; i <= index; i++) keys[i] = (await readKey(room.code, i)) ?? { accept: [], correctIndex: -1, explain: "" };
    await reveal(room.code, index, keys, current, players, POINTS);
  }
  if (!q) return <p className="small">Loading question…</p>;

  // A round title card, once per round, exactly like single-player.
  const rounds = SHOW.rounds as Record<string, { title: string; intro: string[] }>;
  if (rounds[q.round] && !introDone.includes(q.round) && room.status === "playing")
    return <TitleCard title={rounds[q.round].title} intro={rounds[q.round].intro} onGo={() => setIntroDone([...introDone, q.round])} />;

  const answer = (choice: number | "skip") => {
    setMine(choice);
    void submitAnswer(room.code, uid, index, choice);
  };
  const listing = q.listingId ? listings.find((l) => l.id === q.listingId) : undefined;
  const haggleOffer = q.negotiateOfferId ? STAGE.offers.find((o) => o.id === q.negotiateOfferId) : undefined;
  const answered = new Set(current.map((a) => a.uid));

  if (room.status === "playing" && haggleOffer) {
    // Haggle Time: the same negotiation as single-player (Gemini voice when available, scripted otherwise; code decides the deal).
    return (
      <section className="beat" key={index}>
        <div className="beat-head">
          <span className="pixel small">
            Question {index + 1} of {room.count}: Haggle Time
          </span>
        </div>
        {mine === null ? (
          <Negotiation stageId={STAGE.id} offer={haggleOffer} difficulty={room.difficulty} scripted={false} onAccept={(t) => answer(t.rentCents)} onWalk={() => answer(haggleOffer.rentCents)} />
        ) : (
          <p className="big-line">
            <Icon name="check" /> Deal locked in at {typeof mine === "number" ? money(mine) : "the listed rent"}. Waiting for the others…
          </p>
        )}
        {isHost && (
          <div className="host-controls">
            <PlayerList players={players} answered={answered} />
            <button className="btn big" onClick={doReveal}>
              Reveal <Icon name="chevron-right" />
            </button>
          </div>
        )}
      </section>
    );
  }

  if (room.status === "playing") {
    const options = listing ? LISTING_CHOICES.map((c, i) => ({ ...c, id: String(i) })) : q.options.map((label, i) => ({ id: String(i), label }));
    const ask = (
      <>
        {mine === null ? (
          <Choices disabled={!ready} options={options} onPick={(id) => answer(Number(id))} onSkip={() => answer("skip")} />
        ) : (
          <p className="big-line">
            <Icon name={mine === "skip" ? "next" : "check"} /> {mine === "skip" ? "Skipped." : "Locked in!"} Waiting for the others…
          </p>
        )}
        {isHost && (
          <div className="host-controls">
            <PlayerList players={players} answered={answered} />
            <button className="btn big" onClick={doReveal}>
              Reveal <Icon name="chevron-right" />
            </button>
          </div>
        )}
      </>
    );
    return (
      <section className="beat" key={index}>
        <div className="beat-head">
          <span className="pixel small">
            Question {index + 1} of {room.count}
            {q.title && !listing ? `: ${q.title}` : ""}
          </span>
          <span className="small">
            {isHost ? current.length : mine !== null ? "You're in" : ""} {isHost ? `/ ${connected.length} answered` : ""}
          </span>
        </div>
        {listing ? (
          <ListingCard l={listing} hint={room.difficulty === "easy"} body={<LinePlayer lines={sentences(q.scenario)} onDone={() => setReady(true)} />} />
        ) : (
          <Host lines={[...sentences(q.scenario).slice(0, 2), q.prompt]} onDone={() => setReady(true)} />
        )}
        {ask}
      </section>
    );
  }

  // ---------- reveal (with drumroll, sounds and the stat card) → scoreboard ----------
  if (board)
    return (
      <section className="beat">
        <h2 className="round-title">Scoreboard</h2>
        <PlayerList players={[...players].sort((a, b) => b.score - a.score)} />
        {isHost ? (
          <button className="btn big" onClick={() => advance(room.code, index, room.count)}>
            {index + 1 < room.count ? "Next question" : "Final results"} <Icon name="chevron-right" />
          </button>
        ) : (
          <p className="small">Waiting for the host…</p>
        )}
      </section>
    );
  if (!key) return <div className="reveal-drum pixel" aria-live="polite"><Icon name="music" /> …</div>;
  if (key.askingCents !== undefined) {
    const asking = key.askingCents;
    const deals = players
      .map((p) => ({ p, a: current.find((x) => x.uid === p.uid) }))
      .map(({ p, a }) => ({ p, rent: a && typeof a.choice === "number" ? a.choice : null }))
      .sort((x, y) => (x.rent ?? Infinity) - (y.rent ?? Infinity));
    const myRent = typeof mine === "number" ? mine : null;
    const best = deals[0];
    return (
      <div className="beat">
        <Reveal
          ok={myRent !== null && myRent < asking ? true : null}
          headline={best?.rent !== null && best?.rent !== undefined ? `Best deal: ${best.p.displayName}, ${money(best.rent)}` : "No deals"}
          lines={[
            myRent === null ? "You didn't close a deal." : myRent < asking ? `You saved ${money(asking - myRent)} a month.` : "You took the listed rent.",
            `Listed at ${money(asking)}. Every dollar saved scores points.`,
          ]}
          points={myRent !== null ? hagglePoints(asking, myRent) : 0}
          onNext={() => setBoard(true)}
          nextLabel="Scoreboard"
        />
        <ul className="party-players results">
          {deals.map(({ p, rent }) => (
            <li key={p.uid}>
              <Sprite appearance={p.sprite ?? DEMO_CHARACTER.appearance} scale={2} />
              <span>{p.displayName}</span>
              <span>{rent === null ? "no deal" : money(rent)}</span>
              <b className="pixel">+{rent === null ? 0 : hagglePoints(asking, rent)}</b>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const right = mine !== null && mine !== "skip" && key.accept.includes(mine);
  const headline = listing ? (listing.answer === "scam" ? "It's a scam!" : listing.answer === "suspicious" ? "Suspicious!" : "Legit!") : q.options[key.correctIndex];
  const teach = q.contentId && !listing ? content(q.contentId).short : null;
  return (
    <div className="beat">
      <Reveal
        ok={mine === "skip" ? null : right}
        skipped={mine === "skip"}
        headline={headline}
        lines={[mine === null ? "No answer this time." : null, listing ? null : `Answer: ${q.options[key.correctIndex]}.`, key.explain || null, teach].filter((x): x is string => !!x).slice(0, 3)}
        why={q.contentId ? [q.contentId] : undefined}
        points={right ? POINTS : 0}
        stat={q.stat}
        onNext={() => setBoard(true)}
        nextLabel="Scoreboard"
      />
      <ul className="party-players results">
        {players.map((p) => {
          const a = current.find((x) => x.uid === p.uid);
          const ok = a && a.choice !== "skip" && key.accept.includes(a.choice);
          return (
            <li key={p.uid}>
              <Sprite appearance={p.sprite ?? DEMO_CHARACTER.appearance} scale={2} />
              <span>{p.displayName}</span>
              <span>{!a ? "no answer" : a.choice === "skip" ? "skipped" : ok ? "right" : "wrong"}</span>
              <Icon name={!a || a.choice === "skip" ? "next" : ok ? "check" : "close"} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Finish({ room, players, uid, isHost, onLeave }: { room: Room; players: Player[]; uid: string; isHost: boolean; onLeave: () => void }) {
  const [mine, setMine] = useState<{ correct: number; wrong: number; skipped: number } | null>(null);
  useEffect(() => {
    play("report");
    const stop = watchAnswers(room.code, async (all) => {
      const t = { correct: 0, wrong: 0, skipped: 0 };
      for (let i = 0; i < room.count; i++) {
        const a = all.find((x) => x.uid === uid && x.index === i);
        const k = await readKey(room.code, i);
        if (!a || a.choice === "skip") t.skipped++;
        else if (k?.askingCents !== undefined ? a.choice < k.askingCents : k?.accept.includes(a.choice)) t.correct++;
        else t.wrong++;
      }
      setMine(t);
    });
    return stop;
  }, [room.code, room.count, uid]);
  const ranked = [...players].sort((a, b) => b.score - a.score);
  return (
    <section className="beat">
      <h2 className="round-title">Final scoreboard</h2>
      <p className="big-line"><Icon name="trophy" /> {ranked[0]?.displayName}</p>
      <PlayerList players={ranked} />
      {mine && (
        <div className="tally" aria-label="Your answers">
          <span className="good"><Icon name="check" /> {mine.correct} correct</span>
          <span className="bad"><Icon name="close" /> {mine.wrong} wrong</span>
          <span><Icon name="next" /> {mine.skipped} skipped</span>
        </div>
      )}
      <div className="choices">
        {isHost && (
          <button className="btn big" onClick={() => playAgain(room.code, players)}>
            <Icon name="play" /> Play again (same room)
          </button>
        )}
        <button className="btn ghost" onClick={onLeave}>
          Leave
        </button>
      </div>
    </section>
  );
}
