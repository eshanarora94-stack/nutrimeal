/**
 * lib/units.ts
 *
 * Free-text unit parsing, normalization, and routing.
 * convert-units handles only dimension-safe standard conversions (g↔kg, ml↔l, tsp↔cup↔ml, etc.)
 * Volume→mass conversions MUST go through lib/density.ts, never through convert-units.
 */

import convert from "convert-units";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ParsedMeasure = {
  amount: number;
  unit: string;
  confident: boolean;
  ambiguousReason?: string; // e.g. "packed vs unpacked"
};

export type NormalizedUnit = {
  canonical: string; // e.g. "tablespoon"
  dimension: "mass" | "volume" | "count" | "unknown";
};

export type ConversionResult =
  | { success: true; amount: number; unit: string }
  | { success: false; reason: "incompatible_dimensions" | "unknown_unit" };

// ── Unit synonym map ──────────────────────────────────────────────────────────

const UNIT_SYNONYMS: Record<string, { canonical: string; dimension: "mass" | "volume" | "count" | "unknown" }> = {
  // Mass
  g: { canonical: "g", dimension: "mass" },
  gram: { canonical: "g", dimension: "mass" },
  grams: { canonical: "g", dimension: "mass" },
  kg: { canonical: "kg", dimension: "mass" },
  kilogram: { canonical: "kg", dimension: "mass" },
  kilograms: { canonical: "kg", dimension: "mass" },
  oz: { canonical: "oz", dimension: "mass" },
  ounce: { canonical: "oz", dimension: "mass" },
  ounces: { canonical: "oz", dimension: "mass" },
  lb: { canonical: "lb", dimension: "mass" },
  lbs: { canonical: "lb", dimension: "mass" },
  pound: { canonical: "lb", dimension: "mass" },
  pounds: { canonical: "lb", dimension: "mass" },
  // Volume
  ml: { canonical: "ml", dimension: "volume" },
  milliliter: { canonical: "ml", dimension: "volume" },
  milliliters: { canonical: "ml", dimension: "volume" },
  millilitre: { canonical: "ml", dimension: "volume" },
  millilitres: { canonical: "ml", dimension: "volume" },
  l: { canonical: "l", dimension: "volume" },
  liter: { canonical: "l", dimension: "volume" },
  liters: { canonical: "l", dimension: "volume" },
  litre: { canonical: "l", dimension: "volume" },
  litres: { canonical: "l", dimension: "volume" },
  tsp: { canonical: "tsp", dimension: "volume" },
  teaspoon: { canonical: "tsp", dimension: "volume" },
  teaspoons: { canonical: "tsp", dimension: "volume" },
  tbsp: { canonical: "Tbs", dimension: "volume" },
  tbs: { canonical: "Tbs", dimension: "volume" },
  tablespoon: { canonical: "Tbs", dimension: "volume" },
  tablespoons: { canonical: "Tbs", dimension: "volume" },
  cup: { canonical: "cup", dimension: "volume" },
  cups: { canonical: "cup", dimension: "volume" },
  "fl oz": { canonical: "fl-oz", dimension: "volume" },
  "fl-oz": { canonical: "fl-oz", dimension: "volume" },
  "fluid ounce": { canonical: "fl-oz", dimension: "volume" },
  "fluid ounces": { canonical: "fl-oz", dimension: "volume" },
  floz: { canonical: "fl-oz", dimension: "volume" },
  pint: { canonical: "pnt", dimension: "volume" },
  pints: { canonical: "pnt", dimension: "volume" },
  // Count
  piece: { canonical: "piece", dimension: "count" },
  pieces: { canonical: "piece", dimension: "count" },
  whole: { canonical: "piece", dimension: "count" },
  count: { canonical: "piece", dimension: "count" },
  slice: { canonical: "piece", dimension: "count" },
  slices: { canonical: "piece", dimension: "count" },
  clove: { canonical: "piece", dimension: "count" },
  cloves: { canonical: "piece", dimension: "count" },
  large: { canonical: "piece", dimension: "count" },
  medium: { canonical: "piece", dimension: "count" },
  small: { canonical: "piece", dimension: "count" },
};

// Units that are ambiguous and need a flag
const AMBIGUOUS_UNITS: Record<string, string> = {
  packed: "packed vs unpacked",
  heaping: "heaping vs level",
  scant: "scant vs level",
  bunch: "bunch size varies",
  handful: "handful size varies",
  pinch: "pinch size varies",
  dash: "dash size varies",
  sprig: "sprig size varies",
  stalk: "stalk size varies",
  head: "head size varies",
  can: "can size varies",
  package: "package size varies",
  pkg: "package size varies",
};

// ── Fraction parsing ──────────────────────────────────────────────────────────

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75,
  "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
  "⅙": 1 / 6, "⅚": 5 / 6, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

function parseAmount(raw: string): number | null {
  raw = raw.trim();

  // Unicode fraction alone
  if (UNICODE_FRACTIONS[raw] !== undefined) return UNICODE_FRACTIONS[raw];

  // Mixed number with unicode fraction: "2½"
  for (const [frac, val] of Object.entries(UNICODE_FRACTIONS)) {
    const idx = raw.indexOf(frac);
    if (idx > 0) {
      const whole = parseFloat(raw.slice(0, idx));
      if (!isNaN(whole)) return whole + val;
    }
  }

  // Slash fraction: "1/2", "3/4"
  const slashMatch = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slashMatch) {
    const num = parseInt(slashMatch[1]);
    const den = parseInt(slashMatch[2]);
    if (den !== 0) return num / den;
  }

  // Mixed number with slash: "2 1/2"
  const mixedMatch = raw.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1]);
    const num = parseInt(mixedMatch[2]);
    const den = parseInt(mixedMatch[3]);
    if (den !== 0) return whole + num / den;
  }

  // Plain decimal or integer
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a free-text ingredient measure like "1½ cups", "200 g", "2 tbsp".
 * Returns the amount, canonical unit, confidence flag, and ambiguity reason if any.
 */
export function parseIngredientMeasure(input: string): ParsedMeasure {
  const trimmed = input.trim().toLowerCase();

  // Replace unicode fractions with decimal for easier regex
  let normalized = trimmed;
  for (const [frac, val] of Object.entries(UNICODE_FRACTIONS)) {
    normalized = normalized.replace(frac, ` ${val} `);
  }

  // Match: optional leading number, optional fraction, unit
  // e.g. "1.5 cups", "2 1/2 tablespoons", "200g", "1/4 tsp"
  const pattern =
    /^([\d\s./½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s*([a-z\-. ]+?)(?:\s+(?:of\s+)?(.+))?$/;
  const match = trimmed.match(pattern);

  if (!match) {
    // No parseable structure — treat whole string as unknown
    return { amount: 1, unit: trimmed, confident: false, ambiguousReason: "could not parse measure" };
  }

  const rawAmount = match[1].trim();
  const rawUnit = match[2].trim();

  const amount = parseAmount(rawAmount);
  if (amount === null) {
    return { amount: 1, unit: rawUnit, confident: false, ambiguousReason: "could not parse amount" };
  }

  // Check for ambiguous qualifiers
  for (const [qualifier, reason] of Object.entries(AMBIGUOUS_UNITS)) {
    if (rawUnit.includes(qualifier)) {
      return { amount, unit: rawUnit, confident: false, ambiguousReason: reason };
    }
  }

  // Normalize unit
  const norm = normalizeUnit(rawUnit);
  if (norm.dimension === "unknown") {
    return { amount, unit: rawUnit, confident: false, ambiguousReason: `unknown unit: ${rawUnit}` };
  }

  return { amount, unit: norm.canonical, confident: true };
}

/**
 * Normalize a raw unit string to a canonical form and dimension.
 */
export function normalizeUnit(unit: string): NormalizedUnit {
  const key = unit.trim().toLowerCase();
  const entry = UNIT_SYNONYMS[key];
  if (entry) return entry;

  // Try with trailing period stripped (e.g. "tbsp.")
  const stripped = key.replace(/\.$/, "");
  const strippedEntry = UNIT_SYNONYMS[stripped];
  if (strippedEntry) return strippedEntry;

  return { canonical: unit, dimension: "unknown" };
}

// convert-units dimension map for our canonical units
const CONVERT_UNITS_MAP: Record<string, string> = {
  g: "g", kg: "kg", oz: "oz", lb: "lb",
  ml: "ml", l: "l", tsp: "tsp", Tbs: "Tbs", cup: "cup", "fl-oz": "fl-oz", pnt: "pnt",
};

/**
 * Convert between standard units using convert-units.
 * ONLY handles dimension-safe conversions (mass↔mass, volume↔volume).
 * Returns incompatible_dimensions if you attempt mass↔volume.
 */
export function convertStandardUnit(
  amount: number,
  fromUnit: string,
  toUnit: string
): ConversionResult {
  const fromNorm = normalizeUnit(fromUnit);
  const toNorm = normalizeUnit(toUnit);

  if (fromNorm.dimension === "unknown") return { success: false, reason: "unknown_unit" };
  if (toNorm.dimension === "unknown") return { success: false, reason: "unknown_unit" };

  if (fromNorm.dimension !== toNorm.dimension) {
    return { success: false, reason: "incompatible_dimensions" };
  }

  if (fromNorm.dimension === "count") {
    // Count units are all "piece" — 1:1
    return { success: true, amount, unit: toNorm.canonical };
  }

  const fromKey = CONVERT_UNITS_MAP[fromNorm.canonical];
  const toKey = CONVERT_UNITS_MAP[toNorm.canonical];
  if (!fromKey || !toKey) return { success: false, reason: "unknown_unit" };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (convert as any)(amount).from(fromKey).to(toKey) as number;
    return { success: true, amount: result, unit: toNorm.canonical };
  } catch {
    return { success: false, reason: "incompatible_dimensions" };
  }
}
