// Typed access to the game data. Fictional scenarios (stages.json) are kept apart from
// real observations (evidence.json) and sourced civic levers (levers.json).
import evidenceJson from "../../data/game/evidence.json";
import leversJson from "../../data/game/levers.json";
import stagesJson from "../../data/game/stages.json";
import type { CmhcTable, Lever, NeighbourhoodEvidence, PlayableStage, Stage, VerifyItemId } from "./types";

export const STAGES = stagesJson.stages as Stage[];
export const VERIFY_ITEMS = stagesJson.verifyItems as { id: VerifyItemId; label: string }[];
export const LEVERS = leversJson.levers as Lever[];
export const FARES = leversJson.fares;
export const ELECTION_HUB = leversJson.electionHub;
export const EVIDENCE = evidenceJson.neighbourhoods as unknown as Record<string, NeighbourhoodEvidence>;
export const CMHC_TABLE = evidenceJson.cmhcTable as unknown as CmhcTable;

export function lever(id: string): Lever {
  const l = LEVERS.find((x) => x.id === id);
  if (!l) throw new Error(`Unknown lever ${id}`);
  return l;
}

export function evidenceFor(neighbourhoodId: number): NeighbourhoodEvidence {
  const e = EVIDENCE[String(neighbourhoodId)];
  if (!e) throw new Error(`No evidence for neighbourhood ${neighbourhoodId}; run npm run build:evidence`);
  return e;
}

/** A stage ships only when enabled AND its civic lever is backed by an official source (PRD §5). */
export function isPlayable(s: Stage): s is PlayableStage {
  return s.enabled && !!s.offers?.length && !!s.civicCards?.length && LEVERS.some((l) => l.id === s.leverId && l.sourced);
}
