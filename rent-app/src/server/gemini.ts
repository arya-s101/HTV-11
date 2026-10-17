// SERVER-ONLY Gemini client: generateContent with JSON output. The key never leaves the server.
import "server-only";

export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const TIMEOUT_MS = 8000;

export const hasGeminiKey = () => !!process.env.GEMINI_API_KEY;

export interface GeminiRequest {
  system: string;
  contents: { role: "user" | "model"; text: string }[];
  schema: Record<string, unknown>;
  temperature?: number;
}

/** Returns the parsed JSON object the model produced. Throws on no key, HTTP error, timeout or bad JSON. */
export async function geminiJson(req: GeminiRequest): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no key");
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.contents.map((c) => ({ role: c.role, parts: [{ text: c.text }] })),
        generationConfig: {
          temperature: req.temperature ?? 0.7,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          responseSchema: req.schema,
        },
      }),
    });
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const body = await res.json();
    const text = body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export const fallbackReasonFor = (e: unknown) => (e instanceof Error && e.name === "AbortError" ? "model timed out" : "model call failed");
