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

/** Emoji and decorative symbols are never read. */
const DECORATIVE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/gu;

export function pronounce(text: string): string {
  let s = text.replace(DECORATIVE, " ");
  // Phone-style service numbers are read digit by digit.
  s = s.replace(/\b311\b/g, DIGIT_WORDS[3] + " " + DIGIT_WORDS[1] + " " + DIGIT_WORDS[1]);
  // Money: "$1,750/mo" → "1,750 dollars a month"; "$3.30" → "3.30 dollars".
  s = s.replace(/\$([\d,]+(?:\.\d+)?)\s*(?:\/\s*mo(?:nth)?\b|a month\b)/g, "$1 dollars a month");
  s = s.replace(/\$([\d,]+(?:\.\d+)?)([kKmM])?\b/g, (_, n: string, unit?: string) => `${n}${unit ? (unit.toLowerCase() === "k" ? " thousand" : " million") : ""} dollars`);
  // Percent.
  s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, "$1 percent");
  // "+ hydro" → "plus hydro"
  s = s.replace(/(^|\s)\+\s*(?=\w)/g, "$1plus ");
  for (const [k, v] of Object.entries(ACRONYMS)) s = s.replace(new RegExp(`(?<![\\w/])${k.replace(/[/.]/g, "\\$&")}(?![\\w/])`, "g"), v);
  // Leftover symbols that voices read badly.
  s = s.replace(/[·•|_*#~^<>{}[\]]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}
