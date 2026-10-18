// Text preparation for read-aloud (PRD v5): speak what's on screen, made pronounceable. One map; add entries here.
const ACRONYMS: Record<string, string> = {
  TTC: "T T C",
  CMHC: "C M H C",
  LTB: "L T B",
  HRTO: "H R T O",
  CAFC: "C A F C",
  "A/C": "air conditioning",
  N9: "N 9",
};
const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

const ONES = [...DIGIT_WORDS, "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : "");
  return [h ? `${ONES[h]} hundred` : "", r || !h ? rest : ""].filter(Boolean).join(" ");
}

/** 1750 → "one thousand seven hundred fifty". Voices read words reliably; digits (especially with commas) they don't. */
export function numberWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n >= 1e12) return String(n);
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (const [size, name] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"], [1, ""]] as const) {
    const chunk = Math.floor(n / size) % 1000;
    if (chunk) parts.push(`${under1000(chunk)}${name ? ` ${name}` : ""}`);
  }
  return parts.join(" ");
}

/** "1,750" / "38.2" / "1974" as words; four-digit years without a comma are read as years. */
function numeral(raw: string): string {
  const [int, dec] = raw.replace(/,/g, "").split(".");
  const n = Number(int);
  if (!dec && /^\d{4}$/.test(raw) && n >= 1900 && n < 2100) return n % 100 === 0 ? numberWords(n) : n < 2000 || n >= 2010 ? `${numberWords(Math.floor(n / 100))} ${n % 100 < 10 ? `oh ${ONES[n % 100]}` : numberWords(n % 100)}` : numberWords(n);
  return numberWords(n) + (dec ? ` point ${[...dec].map((d) => DIGIT_WORDS[Number(d)]).join(" ")}` : "");
}

/** "$1,750" → "one thousand seven hundred fifty dollars"; "$3.30" → "three dollars and thirty cents". */
function dollars(raw: string): string {
  const [int, dec] = raw.replace(/,/g, "").split(".");
  const d = numberWords(Number(int));
  const c = dec ? Number(dec.padEnd(2, "0").slice(0, 2)) : 0;
  return `${d} ${int === "1" ? "dollar" : "dollars"}${c ? ` and ${numberWords(c)} cents` : ""}`;
}

/** Emoji and decorative symbols are never read. */
const DECORATIVE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/gu;

export function pronounce(text: string): string {
  let s = text.replace(DECORATIVE, " ");
  // Phone-style service numbers are read digit by digit.
  s = s.replace(/\b311\b/g, DIGIT_WORDS[3] + " " + DIGIT_WORDS[1] + " " + DIGIT_WORDS[1]);
  // Money, spelled out (the screen keeps the digits): "$1,750/mo" → "one thousand seven hundred fifty dollars a month".
  s = s.replace(/\$([\d,]+(?:\.\d+)?)\s*(?:\/\s*mo(?:nth)?\b|a month\b)/g, (_, n: string) => `${dollars(n)} a month`);
  s = s.replace(/\$([\d,]+(?:\.\d+)?)([kKmM])?\b/g, (_, n: string, unit?: string) =>
    unit ? `${numeral(n)} ${unit.toLowerCase() === "k" ? "thousand" : "million"} dollars` : dollars(n),
  );
  // Percent.
  s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, (_, n: string) => `${numeral(n)} percent`);
  // Any other number.
  s = s.replace(/\d[\d,]*(?:\.\d+)?/g, (n) => numeral(n.replace(/,$/, "")) + (n.endsWith(",") ? "," : ""));
  // "+ hydro" → "plus hydro"
  s = s.replace(/(^|\s)\+\s*(?=\w)/g, "$1plus ");
  for (const [k, v] of Object.entries(ACRONYMS)) s = s.replace(new RegExp(`(?<![\\w/])${k.replace(/[/.]/g, "\\$&")}(?![\\w/])`, "g"), v);
  // Leftover symbols that voices read badly.
  s = s.replace(/[·•|_*#~^<>{}[\]]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}
