// Seeded randomness shared by game logic: deterministic per seed, so multiplayer rooms and the demo replay exactly.
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(xs: T[], r: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** A sub-seed per phase, so one phase's choices don't change another's draw. */
export const sub = (seed: number, salt: string) => {
  let h = seed >>> 0;
  for (const ch of salt) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  return h;
};
