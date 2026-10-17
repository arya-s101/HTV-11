"use client";

// Party mode (PRD v4 Change 5) with complete single-player parity: every player plays the real single-player game
// (same seed, mode, difficulty and scenes, so identical listings, offers, questions, options and stat cards), at
// their own pace (there are no timers), while a live leaderboard tracks everyone. Only a display name and sprite
// are shared; no profile data reaches the room.
import { useEffect, useMemo, useRef, useState } from "react";
import { MODES, type Mode } from "@/config/modes";
import { STAGES } from "@/game/data";
import { listingsFor } from "@/game/journey";
import { planLife } from "@/game/life";
import { planRun } from "@/game/questions";
import { DIFFICULTY_INFO } from "@/game/score";
import { DEMO_CHARACTER, type Character } from "@/game/sprite";
import type { Difficulty, PlayableStage } from "@/game/types";
import { claimHostIfNeeded, createRoom, finishGame, heartbeat, joinRoom, lastStep, leaveRoom, playAgain, reportProgress, setRoomOptions, startGame, watchPlayers, watchRoom, type Player, type Room } from "@/multiplayer/api";
import { firebaseProjectId } from "@/multiplayer/firebase";
import { isCode, normalizeCode } from "@/multiplayer/room";
import { play } from "./audio";
import { Icon } from "./icons";
import { Sprite } from "./pixel";
import { JourneyShow } from "./show/JourneyShow";
import { SHOW } from "./show/primitives";
import { batchesFor, prefetchScenarios } from "./show/scenarios";
import { ShowSettingsProvider } from "./show/settings";

const STAGE = STAGES.find((s) => s.journey)! as PlayableStage;
const roundTitle = (r?: string) => (r && r !== "lobby" ? ((SHOW.rounds as Record<string, { title: string }>)[r]?.title ?? (r === "welcome" ? "Getting ready" : r)) : "In the lobby");

export function Multiplayer({ character, onExit }: { character: Character; onExit: () => void }) {
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
  // Host: when every connected player has reached their report card, show the final scoreboard.
  useEffect(() => {
    if (!room || !code || room.status !== "playing" || room.hostUid !== uid) return;
    const active = players.filter((p) => p.connected);
    if (active.length && active.every((p) => p.done)) void finishGame(code);
  }, [players, room, code, uid]);

  if (!code || !uid) return <Entry character={character} onIn={(c, u) => (setCode(c), setUid(u))} onExit={onExit} />;
  if (!room) return <p className="small">Connecting to room {code}…</p>;
  const isHost = room.hostUid === uid;
  const leave = () => {
    void leaveRoom(code, uid);
    onExit();
  };

  if (room.status === "playing") return <InGame room={room} players={players} uid={uid} isHost={isHost} character={character} onLeave={leave} />;
  return (
    <div className="party">
      <RoomBar room={room} players={players} uid={uid} onLeave={leave} />
      {room.status === "lobby" ? <Lobby room={room} players={players} isHost={isHost} /> : <Final room={room} players={players} isHost={isHost} onLeave={leave} />}
    </div>
  );
}

function RoomBar({ room, players, uid, onLeave }: { room: Room; players: Player[]; uid: string; onLeave: () => void }) {
  const me = players.find((p) => p.uid === uid);
  return (
    <div className="podium-bar">
      <div className="podium">
        <div className="podium-sprite">{me && <Sprite appearance={me.sprite} scale={3} />}</div>
        <div>
          <div className="pixel podium-name">{me?.displayName ?? "You"}</div>
          <div className="small muted">
            Room {room.code} · {room.hostUid === uid ? "you're the host" : `host: ${players.find((p) => p.uid === room.hostUid)?.displayName ?? "…"}`}
          </div>
        </div>
      </div>
      <div className="podium-actions">
        <button className="btn ghost small" onClick={onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}

function Entry({ character, onIn, onExit }: { character: Character; onIn: (code: string, uid: string) => void; onExit: () => void }) {
  const [name, setName] = useState(character.name);
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
      <p className="lede">2–8 players, the full game, a live leaderboard. Only your display name and sprite are shared.</p>
      <div className="row" style={{ alignItems: "center", gap: 12 }}>
        <Sprite appearance={character.appearance} scale={5} />
        <input className="field-input" value={name} maxLength={16} placeholder="Display name" onChange={(e) => setName(e.target.value)} aria-label="Display name" />
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn big" disabled={busy} onClick={() => go(() => createRoom(name, character.appearance))}>
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
              const r = await joinRoom(join, name, character.appearance);
              return r.ok ? { code: join, uid: r.uid } : { error: r.reason };
            })
          }
        >
          Join
        </button>
      </div>
      {msg && <p className="bad-text">{msg}</p>}
      <button className="btn ghost small" onClick={onExit} style={{ marginTop: 16 }}>
        Back to main menu
      </button>
    </section>
  );
}

function Leaderboard({ players, uid }: { players: Player[]; uid?: string }) {
  return (
    <ul className="party-players">
      {[...players]
        .sort((a, b) => b.score - a.score)
        .map((p, i) => (
          <li key={p.uid} className={`${p.connected ? "" : "away"} ${p.uid === uid ? "me" : ""}`}>
            <span className="pixel">{i + 1}</span>
            <Sprite appearance={p.sprite ?? DEMO_CHARACTER.appearance} scale={2} />
            <span>
              {p.displayName}
              <span className="small muted"> · {p.done ? "finished" : roundTitle(p.round)}</span>
            </span>
            <b className="pixel">{p.score}</b>
          </li>
        ))}
    </ul>
  );
}

function Lobby({ room, players, isHost }: { room: Room; players: Player[]; isHost: boolean }) {
  const [starting, setStarting] = useState(false);
  const start = async () => {
    setStarting(true);
    // Scenes are written once for the whole room (generic: no profiles), so every player reads the same text.
    const cfg = MODES[room.mode];
    const plan = planRun(room.seed, room.mode);
    const listingIds = listingsFor(STAGE, room.difficulty, room.seed, cfg.listings).map((l) => l.id);
    const batches = batchesFor(plan, listingIds, cfg.offerIds ?? STAGE.offers.map((o) => o.id), [...cfg.rounds, ...(cfg.scamReport ? ["scamReport"] : [])]);
    const scenes = {};
    await Promise.race([prefetchScenarios(batches, {}, (m) => Object.assign(scenes, m), room.code), new Promise((ok) => setTimeout(ok, 8000))]);
    await startGame(room.code, scenes);
  };
  return (
    <section className="beat">
      <h2 className="round-title">Lobby</h2>
      <p className="big-line">
        Share the code <b className="pixel">{room.code}</b>. {players.length} of 8 players.
      </p>
      <Leaderboard players={players} />
      {isHost ? (
        <>
          <div className="seg" aria-label="Mode">
            {(["base", "extended"] as Mode[]).map((m) => (
              <button key={m} className={`choice ${room.mode === m ? "on" : ""}`} aria-pressed={room.mode === m} onClick={() => setRoomOptions(room.code, { mode: m })}>
                {MODES[m].label}
              </button>
            ))}
          </div>
          <div className="seg" aria-label="Difficulty">
            {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
              <button key={d} className={`choice ${room.difficulty === d ? "on" : ""}`} aria-pressed={room.difficulty === d} onClick={() => setRoomOptions(room.code, { difficulty: d })}>
                {DIFFICULTY_INFO[d].label}
              </button>
            ))}
          </div>
          <p className="small">{MODES[room.mode].blurb} Everyone plays the same game; highest score wins.</p>
          <button className="btn big" disabled={starting} onClick={start}>
            {starting ? "Writing the scenes…" : "Start"} <Icon name="chevron-right" />
          </button>
        </>
      ) : (
        <p className="small">
          {MODES[room.mode].label} · {DIFFICULTY_INFO[room.difficulty].label}. Waiting for the host to start…
        </p>
      )}
    </section>
  );
}

/** The single-player game, unchanged, with the room's settings; progress goes to the leaderboard. */
function InGame({ room, players, uid, isHost, character, onLeave }: { room: Room; players: Player[]; uid: string; isHost: boolean; character: Character; onLeave: () => void }) {
  const plan = useMemo(() => planRun(room.seed, room.mode), [room.seed, room.mode]);
  const me = players.find((p) => p.uid === uid);
  const [lo, hi] = STAGE.ageRange;
  const age = room.mode === "base" ? Math.min(hi, Math.max(lo, character.startAge)) : (planLife(character.startAge).playable.find((x) => x.stage.journey)?.age ?? character.startAge);
  const values = useMemo(() => ({ work: "work", place: "" }), []);
  const stillPlaying = players.filter((p) => p.connected && !p.done).length;
  const panel = (
    <section className="room-panel">
      <h3 className="pixel">Room {room.code}</h3>
      <Leaderboard players={players} uid={uid} />
      <p className="small">{stillPlaying ? `${stillPlaying} still playing. The final scoreboard appears when everyone finishes.` : "Everyone's done!"}</p>
      {isHost && stillPlaying > 0 && (
        <button className="btn ghost small" onClick={() => finishGame(room.code)}>
          End the game now
        </button>
      )}
    </section>
  );
  return (
    <div className="party in-game">
      <details className="room-strip" open>
        <summary className="pixel small">Room {room.code} · leaderboard</summary>
        <Leaderboard players={players} uid={uid} />
      </details>
      <ShowSettingsProvider>
        <JourneyShow
          key={`${room.seed}-${room.mode}-${room.difficulty}`}
          stage={STAGE}
          age={age}
          character={{ ...character, name: me?.displayName ?? character.name }}
          difficulty={room.difficulty}
          seed={room.seed}
          mode={room.mode}
          plan={plan}
          scenarios={room.scenarios ?? {}}
          values={values}
          profile={{}}
          onProfile={() => {}}
          scriptedLandlord={false}
          onReplay={() => {}}
          onQuit={onLeave}
          onExtended={() => {}}
          party={{ onProgress: (p) => void reportProgress(room.code, uid, p), panel }}
        />
      </ShowSettingsProvider>
    </div>
  );
}

function Final({ room, players, isHost, onLeave }: { room: Room; players: Player[]; isHost: boolean; onLeave: () => void }) {
  useEffect(() => play("report"), []);
  const ranked = [...players].sort((a, b) => b.score - a.score);
  return (
    <section className="beat">
      <h2 className="round-title">Final scoreboard</h2>
      <p className="big-line">
        <Icon name="trophy" /> {ranked[0]?.displayName} wins with {ranked[0]?.score} points!
      </p>
      <Leaderboard players={ranked} />
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
