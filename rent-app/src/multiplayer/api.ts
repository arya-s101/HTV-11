"use client";

// Firestore operations for party mode (PRD v4 Change 5). Layout:
//   rooms/{code}                  hostUid, status, mode, difficulty, seed, currentQuestionIndex, count, createdAt, lastActivityAt
//   rooms/{code}/players/{uid}    displayName, sprite, score, joinedAt, connected, lastSeen
//   rooms/{code}/questions/{i}    the question as shown (no answer)
//   rooms/{code}/answerKeys/{i}   readable only after that question's reveal (firestore.rules)
//   rooms/{code}/answers/{i_uid}  one per player per question
// Hackathon limitation: scores are computed by the host's client on reveal, not by a Cloud Function.
import { collection, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, type Unsubscribe } from "firebase/firestore";
import type { Appearance } from "@/game/sprite";
import type { Difficulty } from "@/game/types";
import { db, signIn } from "./firebase";
import { displayName, hagglePoints, makeCode, MAX_PLAYERS, ROOM_TTL_MS, type AnswerKey, type RoomQuestion } from "./room";

export type RoomStatus = "lobby" | "playing" | "reveal" | "finished";
export interface Room {
  code: string;
  hostUid: string;
  status: RoomStatus;
  mode: "base";
  difficulty: Difficulty;
  seed: number;
  currentQuestionIndex: number;
  count: number;
  lastActivityAt?: Timestamp;
}
export interface Player {
  uid: string;
  displayName: string;
  sprite: Appearance;
  score: number;
  joinedAt?: Timestamp;
  connected: boolean;
  lastSeen?: Timestamp;
}
export interface Answer {
  uid: string;
  index: number;
  choice: number | "skip";
}

const roomRef = (code: string) => doc(db(), "rooms", code);
const sub = (code: string, name: string) => collection(db(), "rooms", code, name);

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
      tx.set(roomRef(code), { hostUid: user.uid, status: "lobby", mode: "base", difficulty: "easy", seed: Math.floor(Math.random() * 1_000_000) + 1, currentQuestionIndex: -1, count: 0, createdAt: serverTimestamp(), lastActivityAt: serverTimestamp() });
      return true;
    });
    if (!created) continue;
    lastStep = "adding you to the room";
    await setDoc(doc(sub(code, "players"), user.uid), { displayName: displayName(name, []), sprite, score: 0, joinedAt: serverTimestamp(), connected: true, lastSeen: serverTimestamp() });
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
  const me = await getDoc(doc(sub(code, "players"), user.uid)).catch(() => null);
  if (me?.exists()) {
    // Rejoining on the same device: the anonymous UID is the same.
    await updateDoc(me.ref, { connected: true, lastSeen: serverTimestamp() });
    return { ok: true, uid: user.uid };
  }
  if (room.status !== "lobby") return { ok: false, reason: "Game in progress. Wait for the next round in this room." };
  const players = (await getDocs(sub(code, "players"))).docs.map((d) => d.data() as Player);
  if (players.length >= MAX_PLAYERS) return { ok: false, reason: "This room is full (8 players)." };
  await setDoc(doc(sub(code, "players"), user.uid), { displayName: displayName(name, players.map((p) => p.displayName)), sprite, score: 0, joinedAt: serverTimestamp(), connected: true, lastSeen: serverTimestamp() });
  return { ok: true, uid: user.uid };
}

export function watchRoom(code: string, cb: (r: Room | null) => void): Unsubscribe {
  return onSnapshot(roomRef(code), (s) => cb(s.exists() ? ({ code, ...(s.data() as Omit<Room, "code">) } as Room) : null), () => cb(null));
}
export function watchPlayers(code: string, cb: (p: Player[]) => void): Unsubscribe {
  return onSnapshot(sub(code, "players"), (s) => cb(s.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Player, "uid">) })).sort((a, b) => (a.joinedAt?.toMillis() ?? 0) - (b.joinedAt?.toMillis() ?? 0))));
}
export function watchQuestion(code: string, index: number, cb: (q: RoomQuestion | null) => void): Unsubscribe {
  return onSnapshot(doc(sub(code, "questions"), String(index)), (s) => cb(s.exists() ? (s.data() as RoomQuestion) : null));
}
export function watchAnswers(code: string, cb: (a: Answer[]) => void): Unsubscribe {
  return onSnapshot(sub(code, "answers"), (s) => cb(s.docs.map((d) => d.data() as Answer)), () => cb([]));
}
export async function readKey(code: string, index: number): Promise<AnswerKey | null> {
  const s = await getDoc(doc(sub(code, "answerKeys"), String(index))).catch(() => null);
  return s?.exists() ? (s.data() as AnswerKey) : null;
}

/** Host: settings in the lobby. */
export const setRoomOptions = (code: string, patch: Partial<Pick<Room, "difficulty">>) => updateDoc(roomRef(code), { ...patch, lastActivityAt: serverTimestamp() });

/** Host: writes everyone's identical questions and the hidden keys, then starts question 0. */
export async function startGame(code: string, questions: RoomQuestion[], keys: AnswerKey[]) {
  const b = writeBatch(db());
  questions.forEach((q, i) => {
    b.set(doc(sub(code, "questions"), String(i)), q);
    b.set(doc(sub(code, "answerKeys"), String(i)), keys[i]);
  });
  await b.commit();
  await updateDoc(roomRef(code), { status: "playing", currentQuestionIndex: 0, count: questions.length, lastActivityAt: serverTimestamp() });
}

/** Player: one answer per question (the rules reject a second write). */
export async function submitAnswer(code: string, uid: string, index: number, choice: number | "skip") {
  await setDoc(doc(sub(code, "answers"), `${index}_${uid}`), { uid, index, choice, answeredAt: serverTimestamp() });
}

/** Host: reveal, then score this question (known limitation: client-side scoring by the host). */
export async function reveal(code: string, index: number, keys: AnswerKey[], answers: Answer[], players: Player[], points: number) {
  await updateDoc(roomRef(code), { status: "reveal", lastActivityAt: serverTimestamp() });
  const b = writeBatch(db());
  const k = keys[index];
  for (const p of players) {
    const a = answers.find((x) => x.uid === p.uid && x.index === index);
    if (!a || a.choice === "skip") continue;
    // Haggle Time scores the rent each player agreed; other questions score a right answer.
    const earned = k.askingCents !== undefined ? hagglePoints(k.askingCents, a.choice) : k.accept.includes(a.choice) ? points : 0;
    if (earned > 0) b.update(doc(sub(code, "players"), p.uid), { score: p.score + earned });
  }
  await b.commit();
}

/** Host: next question, or finish. */
export async function advance(code: string, index: number, count: number) {
  await updateDoc(roomRef(code), index + 1 < count ? { status: "playing", currentQuestionIndex: index + 1, lastActivityAt: serverTimestamp() } : { status: "finished", currentQuestionIndex: count, lastActivityAt: serverTimestamp() });
}

/** Host: same room, new game. */
export async function playAgain(code: string, players: Player[]) {
  const b = writeBatch(db());
  for (const p of players) b.update(doc(sub(code, "players"), p.uid), { score: 0 });
  for (const a of (await getDocs(sub(code, "answers"))).docs) b.delete(a.ref);
  await b.commit();
  await updateDoc(roomRef(code), { status: "lobby", currentQuestionIndex: -1, seed: Math.floor(Math.random() * 1_000_000) + 1, lastActivityAt: serverTimestamp() });
}

/** Presence heartbeat; also marks this player gone when the tab closes. */
export function heartbeat(code: string, uid: string): () => void {
  const ref = doc(sub(code, "players"), uid);
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
export async function claimHostIfNeeded(code: string, uid: string, room: Room, players: Player[]) {
  const host = players.find((p) => p.uid === room.hostUid);
  const stale = !host || !host.connected || (host.lastSeen && Date.now() - host.lastSeen.toMillis() > 60_000);
  if (!stale) return;
  const next = players.filter((p) => p.connected && p.uid !== room.hostUid)[0];
  if (next?.uid !== uid) return;
  await updateDoc(roomRef(code), { hostUid: uid, lastActivityAt: serverTimestamp() }).catch(() => {});
}

export async function leaveRoom(code: string, uid: string) {
  await updateDoc(doc(sub(code, "players"), uid), { connected: false }).catch(() => {});
}
