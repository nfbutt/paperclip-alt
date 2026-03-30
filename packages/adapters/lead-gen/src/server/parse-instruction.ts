// ---------------------------------------------------------------------------
// Natural language instruction parser → MlsSearchParams
//
// Maps phrases like "Target luxury condos in Miami under $2M listed in the
// last 30 days" to structured MLS query parameters.
//
// This is intentionally rule-based and lightweight. For production, replace
// with an LLM call (e.g. Claude) or a dedicated NLP pipeline.
// ---------------------------------------------------------------------------

import type { MlsSearchParams } from "./mls.js";

const PRICE_PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => { min?: number; max?: number }]> = [
  [
    /between\s+\$?([\d,.]+[kmb]?)\s+and\s+\$?([\d,.]+[kmb]?)/i,
    (m) => ({ min: parseMoney(m[1]), max: parseMoney(m[2]) }),
  ],
  [/under\s+\$?([\d,.]+[kmb]?)/i, (m) => ({ max: parseMoney(m[1]) })],
  [/below\s+\$?([\d,.]+[kmb]?)/i, (m) => ({ max: parseMoney(m[1]) })],
  [/above\s+\$?([\d,.]+[kmb]?)/i, (m) => ({ min: parseMoney(m[1]) })],
  [/over\s+\$?([\d,.]+[kmb]?)/i, (m) => ({ min: parseMoney(m[1]) })],
  [/up\s+to\s+\$?([\d,.]+[kmb]?)/i, (m) => ({ max: parseMoney(m[1]) })],
];

const LISTING_AGE_PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => number]> = [
  [/last\s+(\d+)\s+days?/i, (m) => Number(m[1])],
  [/past\s+(\d+)\s+days?/i, (m) => Number(m[1])],
  [/(\d+)\s+days?\s+ago/i, (m) => Number(m[1])],
  [/new\s+listings?/i, () => 7],
  [/this\s+week/i, () => 7],
  [/this\s+month/i, () => 30],
];

const PROPERTY_TYPE_KEYWORDS: Record<string, string> = {
  condo: "Condo",
  condos: "Condo",
  condominium: "Condo",
  house: "Single Family",
  houses: "Single Family",
  "single-family": "Single Family",
  "single family": "Single Family",
  sfr: "Single Family",
  townhouse: "Townhouse",
  townhomes: "Townhouse",
  townhome: "Townhouse",
  multifamily: "Multi Family",
  "multi-family": "Multi Family",
  duplex: "Multi Family",
  land: "Land",
  lot: "Land",
};

// Recognized US state abbreviations and full names for location extraction.
const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

function parseMoney(raw: string): number {
  const cleaned = raw.replace(/,/g, "").toLowerCase();
  const suffix = cleaned.slice(-1);
  const num = parseFloat(cleaned);
  if (suffix === "k") return num * 1_000;
  if (suffix === "m") return num * 1_000_000;
  if (suffix === "b") return num * 1_000_000_000;
  return num;
}

function extractLocation(instruction: string): string {
  // "in <Location>" pattern — capture until end or a known keyword boundary.
  const inMatch = instruction.match(/\bin\s+([A-Z][a-zA-Z\s,]+?)(?:\s+(?:under|above|between|over|up\s+to|below|listed|with|last|past|this|for|\d)|$)/i);
  if (inMatch) {
    const candidate = inMatch[1].trim().replace(/,$/, "");
    if (candidate.length >= 2) return candidate;
  }

  // Fallback: look for known state abbreviation pairs like "Austin TX"
  const stateMatch = instruction.match(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+([A-Z]{2})\b/);
  if (stateMatch && US_STATES.has(stateMatch[2])) {
    return `${stateMatch[1]} ${stateMatch[2]}`;
  }

  return "";
}

function extractPropertyType(instruction: string): string | undefined {
  const lower = instruction.toLowerCase();
  for (const [keyword, normalized] of Object.entries(PROPERTY_TYPE_KEYWORDS)) {
    if (lower.includes(keyword)) return normalized;
  }
  return undefined;
}

export function parseInstruction(
  instruction: string,
  maxResults: number,
): MlsSearchParams {
  const location = extractLocation(instruction);
  const propertyType = extractPropertyType(instruction);

  let minPrice: number | undefined;
  let maxPrice: number | undefined;
  for (const [pattern, extract] of PRICE_PATTERNS) {
    const m = instruction.match(pattern);
    if (m) {
      const prices = extract(m);
      if (prices.min != null) minPrice = prices.min;
      if (prices.max != null) maxPrice = prices.max;
      break;
    }
  }

  let maxListingAgeDays: number | undefined;
  for (const [pattern, extract] of LISTING_AGE_PATTERNS) {
    const m = instruction.match(pattern);
    if (m) {
      maxListingAgeDays = extract(m);
      break;
    }
  }

  return {
    location: location || instruction,
    minPrice,
    maxPrice,
    maxListingAgeDays,
    propertyType,
    maxResults,
  };
}
