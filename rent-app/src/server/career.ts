// SERVER-ONLY: builds a story-only job path for a custom profession with Gemini, validated in code.
import "server-only";
import { cleanProfession, MAX_PROFESSION_CHARS, PRESETS, presetProfession, STAGE_IDS, templatePath, validatePath, type Profession } from "@/game/career";
import { STAGES } from "@/game/data";
import { fallbackReasonFor, geminiJson, hasGeminiKey } from "./gemini";

const SYSTEM = [
  "You write short, realistic career stories for an educational Toronto life-sim game about renting.",
  `Given an occupation or a career field, return one step per life stage, in order: ${STAGES.map((s) => `${s.id} (${s.title}, around age ${s.defaultAge})`).join("; ")}.`,
  "Each step: a job title (max 40 characters) and a one-sentence blurb (max 110 characters) about the person's work life at that stage.",
  "Rules: no numbers, digits, salaries, money, percentages or employer names; gender-neutral; respectful; plausible in Toronto.",
  "For a career field, pick one plausible career within it. The student stage is about studying or training for it. The retirement stage is after the career.",
  "Vary the specific roles and details each time; avoid generic wording.",
  'If the input is not a real, appropriate occupation, return {"valid": false, "stages": []}.',
].join("\n");

const SCHEMA = {
  type: "OBJECT",
  properties: {
    valid: { type: "BOOLEAN" },
    stages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { stage_id: { type: "STRING", enum: STAGE_IDS }, title: { type: "STRING" }, blurb: { type: "STRING" } },
        required: ["stage_id", "title", "blurb"],
      },
    },
  },
  required: ["valid", "stages"],
};

async function askModel(occupation: string, callModel: typeof geminiJson): Promise<{ path: ReturnType<typeof validatePath>; invalid: boolean }> {
  const raw = (await callModel({ system: SYSTEM, contents: [{ role: "user", text: `Occupation: ${occupation}` }], schema: SCHEMA, temperature: 0.9 })) as { valid?: boolean };
  return { path: raw?.valid === false ? null : validatePath(raw), invalid: raw?.valid === false };
}

/** A preset: Gemini writes a fresh path each time; the handwritten path is the fallback. */
export async function presetCareer(presetId: string, callModel: typeof geminiJson = geminiJson): Promise<CareerResult> {
  if (!PRESETS.some((p) => p.id === presetId)) return { ok: false, error: "Unknown preset" };
  const handwritten = presetProfession(presetId);
  if (!hasGeminiKey() && callModel === geminiJson) return { ok: true, profession: handwritten, fallbackReason: "no GEMINI_API_KEY configured" };
  try {
    const { path } = await askModel(handwritten.label, callModel);
    return path ? { ok: true, profession: { ...handwritten, path, source: "llm" } } : { ok: true, profession: handwritten, fallbackReason: "model output failed validation" };
  } catch (e) {
    return { ok: true, profession: handwritten, fallbackReason: fallbackReasonFor(e) };
  }
}

export type CareerResult = { ok: true; profession: Profession; fallbackReason?: string } | { ok: false; error: string };

export async function customCareer(raw: string, callModel: typeof geminiJson = geminiJson): Promise<CareerResult> {
  const label = cleanProfession(raw);
  if (!label) return { ok: false, error: `Use 2 to ${MAX_PROFESSION_CHARS} letters for a job title, like "pharmacist" or "bus driver".` };
  const template = (fallbackReason: string): CareerResult => ({ ok: true, profession: { id: "custom", label, path: templatePath(label), source: "template" }, fallbackReason });
  if (!hasGeminiKey() && callModel === geminiJson) return template("no GEMINI_API_KEY configured");
  try {
    const { path, invalid } = await askModel(label, callModel);
    if (invalid) return { ok: false, error: "That doesn't look like an occupation. Try another job title." };
    return path ? { ok: true, profession: { id: "custom", label, path, source: "llm" } } : template("model output failed validation");
  } catch (e) {
    return template(fallbackReasonFor(e));
  }
}
