"use client";

// Firestore operations for party mode (PRD v4 Change 5, full parity with single-player). Layout:
//   rooms/{code}                hostUid, status, mode, difficulty, seed, scenarios, createdAt, lastActivityAt
//   rooms/{code}/players/{uid}  displayName, sprite, score, round, done, joinedAt, connected, lastSeen
// Everyone plays the single-player game with the room's seed, mode, difficulty and shared scenarios, so questions,
// options, offers and stat cards are identical; the room syncs scores and progress for a live leaderboard.
// Hackathon limitation: each client reports its own score (rules only allow it to go up, within bounds).
import { collection, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, type Unsubscribe } from "firebase/firestore";
import type { Mode } from "@/config/modes";
import type { ScenarioMap } from "@/game/questions";
import type { Appearance } from "@/game/sprite";
import type { Difficulty } from "@/game/types";
import { db, signIn } from "./firebase";
import { displayName, makeCode, MAX_PLAYERS, ROOM_TTL_MS } from "./room";

export type RoomStatus = "lobby" | "playing" | "finished";
export interface Room {
  code: string;
  hostUid: string;
  status: RoomStatus;
  mode: Mode;
  difficulty: Difficulty;
  seed: number;
  scenarios?: ScenarioMap;
  lastActivityAt?: Timestamp;
}
export interface Player {
  uid: string;
  displayName: string;
  sprite: Appearance;
  score: number;
  round?: string;
  done?: boolean;
  joinedAt?: Timestamp;
  connected: boolean;
  lastSeen?: Timestamp;
}

const roomRef = (code: string) => doc(db(), "rooms", code);
const players = (code: string) => collection(db(), "rooms", code, "players");
const newSeed = () => Math.floor(Math.random() * 1_000_000) + 1;

/** The step in progress, so a stall can be reported precisely. */
export let lastStep = "";

export async function createRoom(name: string, sprite: Appearance): Promise<{ code: string; uid: string }> {
  lastStep = "signing in anonymously";
  const user = await signIn();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    lastStep = "creating the room in Firestore";
    const created = await runTransaction(db(), async (tx) => {
      const existing = await tx.get(roomRef(code));
      if (existing.exists()) return false; // collision: try another code
      tx.set(roomRef(code), { hostUid: user.uid, status: "lobby", mode: "base", difficulty: "easy", seed: newSeed(), createdAt: serverTimestamp(), lastActivityAt: serverTimestamp() });
      return true;
    });
    if (!created) continue;
    lastStep = "adding you to the room";
    await setDoc(doc(players(code), user.uid), { displayName: displayName(name, []), sprite, score: 0, round: "lobby", done: false, joinedAt: serverTimestamp(), connected: true, lastSeen: serverTimestamp() });
    return { code, uid: user.uid };
  }
  throw new Error("Couldn't find a free room code. Try again.");
}

export type JoinResult = { ok: true; uid: string } | { ok: false; reason: string };

export async function joinRoom(code: string, name: string, sprite: Appearance): Promise<JoinResult> {
  lastStep = "signing in anonymously";
  const user = await signIn();
  lastStep = "looking up the room in Firestore";
  const snap = await getDoc(roomRef(code)).catch(() => null);
  if (!snap?.exists()) return { ok: false, reason: "No room with that code." };
  const room = snap.data() as Room;
  const fresh = room.lastActivityAt ? Date.now() - room.lastActivityAt.toMillis() < ROOM_TTL_MS : true;
  if (!fresh) return { ok: false, reason: "That room has expired." };
  const me = await getDoc(doc(players(code), user.uid)).catch(() => null);
  if (me?.exists()) {
    // Rejoining on the same device: the anonymous UID is the same.
    await updateDoc(me.ref, { connected: true, lastSeen: serverTimestamp() });
    return { ok: true, uid: user.uid };
  }
  if (room.status !== "lobby") return { ok: false, reason: "Game in progress. Join when this room is back in the lobby." };
  const all = (await getDocs(players(code))).docs.map((d) => d.data() as Player);
  if (all.length >= MAX_PLAYERS) return { ok: false, reason: "This room is full (8 players)." };
  await setDoc(doc(players(code), user.uid), { displayName: displayName(name, all.map((p) => p.displayName)), sprite, score: 0, round: "lobby", done: false, joinedAt: serverTimestamp(), connected: true, lastSeen: serverTimestamp() });
  return { ok: true, uid: user.uid };
}

export function watchRoom(code: string, cb: (r: Room | null) => void): Unsubscribe {
  return onSnapshot(roomRef(code), (s) => cb(s.exists() ? ({ code, ...(s.data() as Omit<Room, "code">) } as Room) : null), () => cb(null));
}
export function watchPlayers(code: string, cb: (p: Player[]) => void): Unsubscribe {
  return onSnapshot(players(code), (s) => cb(s.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Player, "uid">) })).sort((a, b) => (a.joinedAt?.toMillis() ?? 0) - (b.joinedAt?.toMillis() ?? 0))));
}

/** Host: lobby settings. */
export const setRoomOptions = (code: string, patch: Partial<Pick<Room, "difficulty" | "mode">>) => updateDoc(roomRef(code), { ...patch, lastActivityAt: serverTimestamp() });

/** Host: starts everyone on the same game, with the scenes written once for the whole room. */
export async function startGame(code: string, scenarios: ScenarioMap) {
  await updateDoc(roomRef(code), { status: "playing", scenarios, lastActivityAt: serverTimestamp() });
}

/** Player: my score and where I am, for the live leaderboard. */
export async function reportProgress(code: string, uid: string, p: { score: number; round: string; done: boolean }) {
  await updateDoc(doc(players(code), uid), { ...p, lastSeen: serverTimestamp() }).catch(() => {});
}

/** Host: everyone finished (or the host ends it) → final scoreboard. */
export const finishGame = (code: string) => updateDoc(roomRef(code), { status: "finished", lastActivityAt: serverTimestamp() });

/** Host: same room, new game. */
export async function playAgain(code: string, all: Player[]) {
  const b = writeBatch(db());
  for (const p of all) b.update(doc(players(code), p.uid), { score: 0, round: "lobby", done: false });
  await b.commit();
  await updateDoc(roomRef(code), { status: "lobby", seed: newSeed(), scenarios: {}, lastActivityAt: serverTimestamp() });
}

/** Presence heartbeat; also marks this player gone when the tab closes. */
export function heartbeat(code: string, uid: string): () => void {
  const ref = doc(players(code), uid);
  const beat = () => updateDoc(ref, { connected: true, lastSeen: serverTimestamp() }).catch(() => {});
  beat();
  const t = setInterval(beat, 20_000);
  const gone = () => void updateDoc(ref, { connected: false }).catch(() => {});
  window.addEventListener("pagehide", gone);
  return () => {
    clearInterval(t);
    window.removeEventListener("pagehide", gone);
    gone();
  };
}

/** When the host has gone quiet, the longest-connected player takes over (rules check the host really left). */
export async function claimHostIfNeeded(code: string, uid: string, room: Room, all: Player[]) {
  const host = all.find((p) => p.uid === room.hostUid);
  const stale = !host || !host.connected || (host.lastSeen && Date.now() - host.lastSeen.toMillis() > 60_000);
  if (!stale) return;
  const next = all.filter((p) => p.connected && p.uid !== room.hostUid)[0];
  if (next?.uid !== uid) return;
  await updateDoc(roomRef(code), { hostUid: uid, lastActivityAt: serverTimestamp() }).catch(() => {});
}

export async function leaveRoom(code: string, uid: string) {
  await updateDoc(doc(players(code), uid), { connected: false }).catch(() => {});
}
