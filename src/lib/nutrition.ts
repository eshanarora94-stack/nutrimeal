/**
 * lib/nutrition.ts
 *
 * Deterministic nutrition engine. No external calls. Offline-capable.
 */

import type { MealPlan, NutritionGoal, NutrientReference } from "@prisma/client";

// ── Supporting types ──────────────────────────────────────────────────────────

export interface StoredNutrient {
  nutrientId: string;
  name: string;
  amount: number; // per 100g
  unitName: string;
  nutrientNumber?: string;
}

export interface RecipeIngredientWithNutrients {
  amount: number;
  unit: string;
  amountGrams: number | null;
  ingredient: {
    nutrients: unknown; // JSON stored as unknown, cast at runtime
  };
}

export interface RecipeWithIngredients {
  servings: number;
  ingredients: RecipeIngredientWithNutrients[];
}

export interface NutrientTotal {
  nutrientId: string;
  nutrientName: string;
  amount: number;
  unitName: string;
}

export interface MacroTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface DayNutrition {
  date: string; // ISO date string
  nutrients: NutrientTotal[];
  macros: MacroTotals;
}

// ── Public types (from spec) ──────────────────────────────────────────────────

export type NutrientGap = {
  nutrientId: string;
  nutrientName: string;
  consumedAmount: number;
  targetAmount: number;
  unitName: string;
  percentOfTarget: number;
  severity: "low" | "moderate" | "severe";
  limitType: "target" | "upper_limit" | "guideline" | "none";
};

export type NutritionScore = {
  score: number; // 0–100 composite
  macroScore: number;
  micronutrientScore: number;
  calorieScore: number;
  deficiencies: NutrientGap[];
  excesses: NutrientGap[];
};

export type WeeklyAnalysis = {
  averageCalories: number;
  averageMacros: MacroTotals;
  averageMicronutrients: NutrientTotal[];
  recurringDeficiencies: NutrientGap[]; // flagged on 3+ of 7 days
  recurringExcesses: NutrientGap[];
  bestDay: { date: string; score: number } | null;
  worstDay: { date: string; score: number } | null;
  weeklyScore: number; // avg of days with >= 1 meal planned
  planCompletion: number; // 0–1
};

// ── USDA nutrient number constants ────────────────────────────────────────────

const NUTRIENT_NUMBERS = {
  CALORIES: "208",
  PROTEIN: "203",
  CARBS: "205",
  FAT: "204",
  FIBER: "291",
  SODIUM: "307",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseNutrients(raw: unknown): StoredNutrient[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw as StoredNutrient[];
}

/**
 * Scale per-100g nutrient values by actual weight in grams.
 */
function scaleNutrients(nutrients: StoredNutrient[], grams: number): NutrientTotal[] {
  const factor = grams / 100;
  return nutrients.map((n) => ({
    nutrientId: n.nutrientId,
    nutrientName: n.name,
    amount: n.amount * factor,
    unitName: n.unitName,
  }));
}

/**
 * Merge nutrient totals arrays by summing matching nutrientId entries.
 */
function mergeNutrients(arrays: NutrientTotal[][]): NutrientTotal[] {
  const map = new Map<string, NutrientTotal>();
  for (const arr of arrays) {
    for (const n of arr) {
      const existing = map.get(n.nutrientId);
      if (existing) {
        map.set(n.nutrientId, { ...existing, amount: existing.amount + n.amount });
      } else {
        map.set(n.nutrientId, { ...n });
      }
    }
  }
  return Array.from(map.values());
}

function findByNumber(nutrients: NutrientTotal[], number: string, references: NutrientReference[]): number {
  const ref = references.find((r) => r.nutrientNumber === number);
  if (!ref) return 0;
  const n = nutrients.find((t) => t.nutrientId === ref.nutrientId);
  return n?.amount ?? 0;
}

function extractMacros(nutrients: NutrientTotal[], references: NutrientReference[]): MacroTotals {
  return {
    calories: findByNumber(nutrients, NUTRIENT_NUMBERS.CALORIES, references),
    proteinG: findByNumber(nutrients, NUTRIENT_NUMBERS.PROTEIN, references),
    carbsG: findByNumber(nutrients, NUTRIENT_NUMBERS.CARBS, references),
    fatG: findByNumber(nutrients, NUTRIENT_NUMBERS.FAT, references),
    fiberG: findByNumber(nutrients, NUTRIENT_NUMBERS.FIBER, references),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Calculate total nutrition for a recipe (full recipe, not per serving).
 * Returns nutrient totals and macros for the entire recipe.
 */
export function calculateRecipeNutrition(
  recipe: RecipeWithIngredients
): { nutrients: NutrientTotal[]; macros: MacroTotals; perServing: NutrientTotal[] } {
  const ingredientNutrients: NutrientTotal[][] = [];

  for (const ri of recipe.ingredients) {
    if (ri.amountGrams == null) continue;
    const nutrients = parseNutrients(ri.ingredient.nutrients);
    if (nutrients.length === 0) continue;
    ingredientNutrients.push(scaleNutrients(nutrients, ri.amountGrams));
  }

  const total = mergeNutrients(ingredientNutrients);
  const perServing = total.map((n) => ({
    ...n,
    amount: n.amount / (recipe.servings || 1),
  }));

  // Macros from per-serving (caller can scale as needed)
  const macros: MacroTotals = {
    calories: (total.find((n) => n.nutrientName.toLowerCase().includes("energy"))?.amount ?? 0) / recipe.servings,
    proteinG: (total.find((n) => n.nutrientName.toLowerCase().includes("protein"))?.amount ?? 0) / recipe.servings,
    carbsG: (total.find((n) => n.nutrientName.toLowerCase().includes("carbohydrate"))?.amount ?? 0) / recipe.servings,
    fatG: (total.find((n) => n.nutrientName.toLowerCase().includes("fat"))?.amount ?? 0) / recipe.servings,
    fiberG: (total.find((n) => n.nutrientName.toLowerCase().includes("fiber"))?.amount ?? 0) / recipe.servings,
  };

  return { nutrients: total, macros, perServing };
}

/**
 * Detect nutrient deficiencies and excesses for a given day's nutrition.
 */
export function detectNutrientGaps(
  dayNutrition: DayNutrition,
  goals: NutritionGoal,
  references: NutrientReference[]
): { deficiencies: NutrientGap[]; excesses: NutrientGap[] } {
  const deficiencies: NutrientGap[] = [];
  const excesses: NutrientGap[] = [];

  for (const ref of references) {
    if (ref.limitType === "none") continue;

    const consumed = dayNutrition.nutrients.find((n) => n.nutrientId === ref.nutrientId);
    const consumedAmount = consumed?.amount ?? 0;

    // Check custom goals first
    const customGoals = (goals.customGoals as Array<{ nutrientId: string; targetAmount: number; isUpperLimit: boolean }> | null) ?? [];
    const custom = customGoals.find((g) => g.nutrientId === ref.nutrientId);

    if (ref.limitType === "target") {
      const target = custom?.targetAmount ?? ref.defaultTarget;
      if (target == null) continue;

      const pct = (consumedAmount / target) * 100;

      if (pct < 100) {
        let severity: "low" | "moderate" | "severe";
        if (pct >= 80) severity = "low";
        else if (pct >= 50) severity = "moderate";
        else severity = "severe";

        deficiencies.push({
          nutrientId: ref.nutrientId,
          nutrientName: ref.canonicalName,
          consumedAmount,
          targetAmount: target,
          unitName: ref.unitName,
          percentOfTarget: pct,
          severity,
          limitType: "target",
        });
      }
    } else if (ref.limitType === "upper_limit") {
      const limit = custom?.targetAmount ?? ref.defaultUpperLimit;
      if (limit == null) continue;

      const pct = (consumedAmount / limit) * 100;

      if (pct > 100) {
        excesses.push({
          nutrientId: ref.nutrientId,
          nutrientName: ref.canonicalName,
          consumedAmount,
          targetAmount: limit,
          unitName: ref.unitName,
          percentOfTarget: pct,
          severity: "low",
          limitType: "upper_limit",
        });
      }
    } else if (ref.limitType === "guideline") {
      const limit = custom?.targetAmount ?? ref.defaultUpperLimit ?? ref.defaultTarget;
      if (limit == null) continue;

      const pct = (consumedAmount / limit) * 100;

      if (pct > 100) {
        excesses.push({
          nutrientId: ref.nutrientId,
          nutrientName: ref.canonicalName,
          consumedAmount,
          targetAmount: limit,
          unitName: ref.unitName,
          percentOfTarget: pct,
          severity: "low", // guideline excess capped at "low"
          limitType: "guideline",
        });
      }
    }
  }

  return { deficiencies, excesses };
}

/**
 * Calculate the composite nutrition score (0–100) for a single day.
 *
 * Weights:
 *   Calorie score   30%
 *   Macro score     40%
 *   Micro score     30%
 *   Upper-limit penalty: -20 per nutrient exceeded
 */
export function calculateDailyNutritionScore(
  dayNutrition: DayNutrition,
  goals: NutritionGoal,
  references: NutrientReference[]
): NutritionScore {
  const { deficiencies, excesses } = detectNutrientGaps(dayNutrition, goals, references);
  const macros = dayNutrition.macros;

  // ── Calorie score (30%) ─────────────────────────────────────────────────────
  const calTarget = goals.calories;
  const calDiff = Math.abs(macros.calories - calTarget) / calTarget;
  const calorieScore = clamp((1 - calDiff) * 100, 0, 100);

  // ── Macro score (40%) ───────────────────────────────────────────────────────
  const macroTargets = [
    { actual: macros.proteinG, target: goals.proteinG },
    { actual: macros.carbsG, target: goals.carbsG },
    { actual: macros.fatG, target: goals.fatG },
  ];
  const macroPcts = macroTargets.map(({ actual, target }) =>
    target > 0 ? clamp(actual / target, 0, 1) : 0
  );
  const macroScore = (macroPcts.reduce((a, b) => a + b, 0) / macroPcts.length) * 100;

  // ── Micro score (30%) ───────────────────────────────────────────────────────
  const microRefs = references.filter(
    (r) => r.limitType === "target" || r.limitType === "guideline"
  );
  let microSum = 0;
  let microCount = 0;
  for (const ref of microRefs) {
    const target = ref.defaultTarget;
    if (!target) continue;
    const consumed = dayNutrition.nutrients.find((n) => n.nutrientId === ref.nutrientId);
    const pct = consumed ? clamp(consumed.amount / target, 0, 1) : 0;
    microSum += pct;
    microCount++;
  }
  const micronutrientScore = microCount > 0 ? (microSum / microCount) * 100 : 100;

  // ── Upper-limit penalty ────────────────────────────────────────────────────
  const penalty = excesses.filter(
    (e) => e.limitType === "upper_limit"
  ).length * 20;

  // ── Composite ──────────────────────────────────────────────────────────────
  const raw =
    calorieScore * 0.3 +
    macroScore * 0.4 +
    micronutrientScore * 0.3 -
    penalty;

  return {
    score: clamp(Math.round(raw), 0, 100),
    macroScore: Math.round(macroScore),
    micronutrientScore: Math.round(micronutrientScore),
    calorieScore: Math.round(calorieScore),
    deficiencies,
    excesses,
  };
}

/**
 * Calculate weekly nutrition analysis across up to 7 days.
 */
export function calculateWeeklyNutritionAnalysis(
  mealPlans: (MealPlan & {
    snapshot: {
      calories: number | null;
      proteinG: number | null;
      carbsG: number | null;
      fatG: number | null;
      fiberG: number | null;
      fullNutrients: unknown;
    } | null;
  })[],
  goals: NutritionGoal,
  references: NutrientReference[]
): WeeklyAnalysis {
  // Group meal plans by date
  const byDate = new Map<string, typeof mealPlans>();
  for (const mp of mealPlans) {
    const date = mp.date.toISOString().split("T")[0];
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(mp);
  }

  if (byDate.size === 0) {
    return {
      averageCalories: 0,
      averageMacros: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
      averageMicronutrients: [],
      recurringDeficiencies: [],
      recurringExcesses: [],
      bestDay: null,
      worstDay: null,
      weeklyScore: 0,
      planCompletion: 0,
    };
  }

  const dayScores: Array<{ date: string; score: NutritionScore; macros: MacroTotals; nutrients: NutrientTotal[] }> = [];

  for (const [date, plans] of byDate) {
    // Aggregate all snapshots for the day
    const dayNutrients: NutrientTotal[][] = plans
      .filter((p) => p.snapshot?.fullNutrients)
      .map((p) => {
        const raw = p.snapshot!.fullNutrients;
        return Array.isArray(raw) ? (raw as NutrientTotal[]).map((n) => ({
          ...n,
          amount: n.amount * (p.servings || 1),
        })) : [];
      });

    const mergedNutrients = mergeNutrients(dayNutrients);
    const macros: MacroTotals = {
      calories: plans.reduce((s, p) => s + ((p.snapshot?.calories ?? 0) * p.servings), 0),
      proteinG: plans.reduce((s, p) => s + ((p.snapshot?.proteinG ?? 0) * p.servings), 0),
      carbsG: plans.reduce((s, p) => s + ((p.snapshot?.carbsG ?? 0) * p.servings), 0),
      fatG: plans.reduce((s, p) => s + ((p.snapshot?.fatG ?? 0) * p.servings), 0),
      fiberG: plans.reduce((s, p) => s + ((p.snapshot?.fiberG ?? 0) * p.servings), 0),
    };

    const dayNutrition: DayNutrition = { date, nutrients: mergedNutrients, macros };
    const score = calculateDailyNutritionScore(dayNutrition, goals, references);
    dayScores.push({ date, score, macros, nutrients: mergedNutrients });
  }

  const n = dayScores.length;
  const avgCalories = dayScores.reduce((s, d) => s + d.macros.calories, 0) / n;
  const avgMacros: MacroTotals = {
    calories: avgCalories,
    proteinG: dayScores.reduce((s, d) => s + d.macros.proteinG, 0) / n,
    carbsG: dayScores.reduce((s, d) => s + d.macros.carbsG, 0) / n,
    fatG: dayScores.reduce((s, d) => s + d.macros.fatG, 0) / n,
    fiberG: dayScores.reduce((s, d) => s + d.macros.fiberG, 0) / n,
  };

  // Average micronutrients
  const avgNutrients = mergeNutrients(dayScores.map((d) => d.nutrients)).map((n) => ({
    ...n,
    amount: n.amount / dayScores.length,
  }));

  // Recurring deficiencies: appear on 3+ days
  const defCounts = new Map<string, { gap: NutrientGap; count: number }>();
  const excCounts = new Map<string, { gap: NutrientGap; count: number }>();

  for (const { score } of dayScores) {
    for (const gap of score.deficiencies) {
      const existing = defCounts.get(gap.nutrientId);
      defCounts.set(gap.nutrientId, { gap, count: (existing?.count ?? 0) + 1 });
    }
    for (const exc of score.excesses) {
      const existing = excCounts.get(exc.nutrientId);
      excCounts.set(exc.nutrientId, { gap: exc, count: (existing?.count ?? 0) + 1 });
    }
  }

  const recurringDeficiencies = Array.from(defCounts.values())
    .filter((v) => v.count >= 3)
    .map((v) => v.gap);
  const recurringExcesses = Array.from(excCounts.values())
    .filter((v) => v.count >= 3)
    .map((v) => v.gap);

  const sorted = [...dayScores].sort((a, b) => b.score.score - a.score.score);
  const weeklyScore = dayScores.reduce((s, d) => s + d.score.score, 0) / n;

  return {
    averageCalories: avgCalories,
    averageMacros: avgMacros,
    averageMicronutrients: avgNutrients,
    recurringDeficiencies,
    recurringExcesses,
    bestDay: sorted[0] ? { date: sorted[0].date, score: sorted[0].score.score } : null,
    worstDay: sorted[sorted.length - 1] ? { date: sorted[sorted.length - 1].date, score: sorted[sorted.length - 1].score.score } : null,
    weeklyScore: Math.round(weeklyScore),
    planCompletion: n / 7,
  };
}
