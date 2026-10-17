// Starting age -> starting stage, and the ages the character reaches at each later stage.
import { isPlayable, STAGES } from "./data";
import type { PlayableStage, Stage } from "./types";

export const MIN_AGE = 16;
export const MAX_AGE = 100;
export const DEFAULT_AGE = 23;

export function stageForAge(age: number): Stage {
  const a = Math.min(MAX_AGE, Math.max(MIN_AGE, Math.round(age)));
  const s = STAGES.find((x) => a >= x.ageRange[0] && a <= x.ageRange[1]);
  if (!s) throw new Error(`No stage covers age ${a}`);
  return s;
}

export interface LifePlan {
  start: Stage;
  /** Playable stages from the starting stage onward, with the character's age at each. */
  playable: { stage: PlayableStage; age: number }[];
  /** Later stages that exist but aren't playable yet (lever not sourced). */
  comingSoon: Stage[];
}

export function planLife(startAge: number): LifePlan {
  const start = stageForAge(startAge);
  const later = STAGES.filter((s) => s.order >= start.order).sort((a, b) => a.order - b.order);
  const playable: LifePlan["playable"] = [];
  let age = Math.round(startAge);
  for (const s of later) {
    age = s === start ? age : Math.max(s.defaultAge, age + 1);
    if (isPlayable(s)) playable.push({ stage: s, age });
  }
  return { start, playable, comingSoon: later.filter((s) => !isPlayable(s)) };
}
