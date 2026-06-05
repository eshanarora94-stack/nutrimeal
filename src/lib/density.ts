/**
 * lib/density.ts
 *
 * Resolves a parsed measure to grams using IngredientDensity records.
 * This is the ONLY place volume→mass conversion happens (not convert-units).
 */

import type { IngredientDensity } from "@prisma/client";
import { normalizeUnit, convertStandardUnit, type ParsedMeasure } from "./units";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GramResolution =
  | { grams: number; confident: true; method: "density" | "piece" | "weight_passthrough" }
  | { grams: null; confident: false; reason: "no_density" | "ambiguous" };

// ── Levenshtein distance for fuzzy name matching ──────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

/**
 * Find the best-matching density record for an ingredient name.
 * Returns the record if similarity ≥ 0.6, otherwise null.
 */
function findDensity(
  ingredientName: string,
  densities: IngredientDensity[]
): IngredientDensity | null {
  const name = ingredientName.toLowerCase().trim();
  let bestScore = 0;
  let bestRecord: IngredientDensity | null = null;

  for (const d of densities) {
    const score = similarityScore(name, d.ingredientName);
    if (score > bestScore) {
      bestScore = score;
      bestRecord = d;
    }
  }

  return bestScore >= 0.6 ? bestRecord : null;
}

// ── Volume → ml via convert-units, then ml → grams via gramsPerMl ─────────────

/**
 * Convert a volume unit amount to millilitres using convert-units.
 * Returns null if not a volume unit.
 */
function toMl(amount: number, unit: string): number | null {
  const result = convertStandardUnit(amount, unit, "ml");
  return result.success ? result.amount : null;
}

// ── Main resolution function ──────────────────────────────────────────────────

/**
 * Resolve a parsed ingredient measure to grams.
 *
 * Resolution priority:
 *   1. Mass unit → direct passthrough (convert to grams via convert-units)
 *   2. Count unit → gramsPerPiece from density record
 *   3. Volume unit → ml via convert-units → grams via gramsPerMl, OR
 *      volume unit → density lookup (cup/tbsp/tsp → gramsPerCup etc.)
 */
export function resolveAmountGrams(
  parsed: ParsedMeasure,
  ingredientName: string,
  densities: IngredientDensity[]
): GramResolution {
  if (!parsed.confident) {
    return { grams: null, confident: false, reason: "ambiguous" };
  }

  const norm = normalizeUnit(parsed.unit);

  // ── 1. Mass unit — direct passthrough ──────────────────────────────────────
  if (norm.dimension === "mass") {
    const toGrams = convertStandardUnit(parsed.amount, parsed.unit, "g");
    if (toGrams.success) {
      return { grams: toGrams.amount, confident: true, method: "weight_passthrough" };
    }
    return { grams: null, confident: false, reason: "no_density" };
  }

  const density = findDensity(ingredientName, densities);

  // ── 2. Count unit — gramsPerPiece ──────────────────────────────────────────
  if (norm.dimension === "count") {
    if (density?.gramsPerPiece != null) {
      return {
        grams: parsed.amount * density.gramsPerPiece,
        confident: true,
        method: "piece",
      };
    }
    return { grams: null, confident: false, reason: "no_density" };
  }

  // ── 3. Volume unit ──────────────────────────────────────────────────────────
  if (norm.dimension === "volume") {
    if (!density) {
      return { grams: null, confident: false, reason: "no_density" };
    }

    const canonical = norm.canonical;

    // Direct lookup by canonical volume unit
    if (canonical === "cup" && density.gramsPerCup != null) {
      return { grams: parsed.amount * density.gramsPerCup, confident: true, method: "density" };
    }
    if (canonical === "Tbs" && density.gramsPerTablespoon != null) {
      return { grams: parsed.amount * density.gramsPerTablespoon, confident: true, method: "density" };
    }
    if (canonical === "tsp" && density.gramsPerTeaspoon != null) {
      return { grams: parsed.amount * density.gramsPerTeaspoon, confident: true, method: "density" };
    }

    // Convert to ml first, then to grams via gramsPerMl
    const ml = toMl(parsed.amount, parsed.unit);
    if (ml !== null) {
      // Try gramsPerMl (liquids)
      if (density.gramsPerMl != null) {
        return { grams: ml * density.gramsPerMl, confident: true, method: "density" };
      }
      // Fall back: convert ml → cups → gramsPerCup
      const cups = ml / 236.588;
      if (density.gramsPerCup != null) {
        return { grams: cups * density.gramsPerCup, confident: true, method: "density" };
      }
      // Fall back: ml → tbsp → gramsPerTablespoon
      const tbsp = ml / 14.7868;
      if (density.gramsPerTablespoon != null) {
        return { grams: tbsp * density.gramsPerTablespoon, confident: true, method: "density" };
      }
    }

    return { grams: null, confident: false, reason: "no_density" };
  }

  return { grams: null, confident: false, reason: "no_density" };
}
