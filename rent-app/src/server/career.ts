// SERVER-ONLY: builds a story-only job path for a custom profession with Gemini, validated in code.
import "server-only";
import { cleanProfession, MAX_PROFESSION_CHARS, STAGE_IDS, templatePath, validatePath, type Profession } from "@/game/career";
import { STAGES } from "@/game/data";
import { fallbackReasonFor, geminiJson, hasGeminiKey } from "./gemini";

const SYSTEM = [
  "You write short, realistic career stories for an educational Toronto life-sim game about renting.",
  `Given an occupation, return one step per life stage, in order: ${STAGES.map((s) => `${s.id} (${s.title}, around age ${s.defaultAge})`).join("; ")}.`,
  "Each step: a job title (max 40 characters) and a one-sentence blurb (max 110 characters) about the person's work life at that stage.",
  "Rules: no numbers, digits, salaries, money, percentages or employer names; gender-neutral; respectful; plausible in Toronto.",
  "The student stage is about studying or training for the occupation. The retirement stage is after the career.",
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

export type CareerResult = { ok: true; profession: Profession; fallbackReason?: string } | { ok: false; error: string };

export async function customCareer(raw: string, callModel: typeof geminiJson = geminiJson): Promise<CareerResult> {
  const label = cleanProfession(raw);
  if (!label) return { ok: false, error: `Use 2 to ${MAX_PROFESSION_CHARS} letters for a job title, like "pharmacist" or "bus driver".` };
  const template = (fallbackReason: string): CareerResult => ({ ok: true, profession: { id: "custom", label, path: templatePath(label), source: "template" }, fallbackReason });
  if (!hasGeminiKey() && callModel === geminiJson) return template("no GEMINI_API_KEY configured");
  try {
    const raw = (await callModel({ system: SYSTEM, contents: [{ role: "user", text: `Occupation: ${label}` }], schema: SCHEMA, temperature: 0.6 })) as { valid?: boolean };
    if (raw?.valid === false) return { ok: false, error: "That doesn't look like an occupation. Try another job title." };
    const path = validatePath(raw);
    return path ? { ok: true, profession: { id: "custom", label, path, source: "llm" } } : template("model output failed validation");
  } catch (e) {
    return template(fallbackReasonFor(e));
  }
}
