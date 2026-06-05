/**
 * lib/optimizer.ts
 *
 * Deterministic heuristic meal-plan optimizer. No ML. No external calls.
 *
 * Scoring weights per spec:
 *   Nutrient gap improvement  +40
 *   Calorie fit               +25
 *   Macro fit                 +15
 *   Pantry match              +10
 *   Time fit                  +10
 *   Upper-limit excess risk   -20
 *
 * Final score: clamp(sum, 0, 100)
 */

import type { NutritionGoal, NutrientReference, PantryItem } from "@prisma/client";
import type { NutrientGap, NutrientTotal } from "./nutrition";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecipeWithNutrition {
  id: string;
  name: string;
  prepMins: number;
  cookMins: number;
  servings: number;
  isFavorite: boolean;
  nutritionScore: number | null;
  lastCookedAt: Date | null;
  /** Per-serving nutrient totals */
  perServing: NutrientTotal[];
  /** Per-serving macros */
  macros: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  /** Ingredient weight coverage in grams (for pantry matching) */
  ingredientWeightG: number;
  ingredients: Array<{
    ingredientId: string;
    amountGrams: number | null;
  }>;
}

export interface MealSlot {
  date: string; // ISO date string "YYYY-MM-DD"
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
}

export interface DayState {
  /** Calories already planned for the day (excluding this slot) */
  calories: number;
  /** Nutrients already accumulated for the day (excluding this slot) */
  nutrients: NutrientTotal[];
}

export interface RecipeGoalScore {
  recipeId: string;
  recipeName: string;
  score: number;
  breakdown: {
    gapImprovement: number;
    calorieFit: number;
    macroFit: number;
    pantryMatch: number;
    timeFit: number;
    excessPenalty: number;
  };
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const MAX_ALLOWED_MINS = 120; // baseline for time-fit denominator

/**
 * Check if adding `recipeNutrients` to `dayNutrients` would push any
 * upper_limit nutrient above its daily limit.
 */
function wouldExceedUpperLimit(
  dayNutrients: NutrientTotal[],
  recipeNutrients: NutrientTotal[],
  references: NutrientReference[]
): boolean {
  for (const ref of references) {
    if (ref.limitType !== "upper_limit") continue;
    const limit = ref.defaultUpperLimit;
    if (limit == null) continue;

    const current = dayNutrients.find((n) => n.nutrientId === ref.nutrientId)?.amount ?? 0;
    const added = recipeNutrients.find((n) => n.nutrientId === ref.nutrientId)?.amount ?? 0;

    if (current + added > limit) return true;
  }
  return false;
}

/**
 * Check if ≥ 80% of recipe ingredient weight is covered by pantry items.
 */
function hasPantryCoverage(
  recipe: RecipeWithNutrition,
  pantry: PantryItem[]
): boolean {
  const totalG = recipe.ingredients.reduce((s, i) => s + (i.amountGrams ?? 0), 0);
  if (totalG === 0) return false;

  const pantryIds = new Set(pantry.map((p) => p.ingredientId).filter(Boolean) as string[]);
  const coveredG = recipe.ingredients
    .filter((i) => i.ingredientId && pantryIds.has(i.ingredientId))
    .reduce((s, i) => s + (i.amountGrams ?? 0), 0);

  return coveredG / totalG >= 0.8;
}

// ── Public functions ──────────────────────────────────────────────────────────

/**
 * Score a recipe purely on how well it closes the current nutrient gaps,
 * ignoring slot-specific context (day calories, time, etc.).
 * Used for simple "what's good for my goals today" queries.
 */
export function scoreRecipeForGoal(
  recipe: RecipeWithNutrition,
  currentGaps: NutrientGap[],
  goals: NutritionGoal
): RecipeGoalScore {
  // Gap improvement score
  let gapImprovement = 0;
  if (currentGaps.length > 0) {
    const gapSum = currentGaps.reduce((sum, gap) => {
      const recipeAmt = recipe.perServing.find((n) => n.nutrientId === gap.nutrientId)?.amount ?? 0;
      return sum + Math.min(recipeAmt / gap.targetAmount, 1);
    }, 0);
    gapImprovement = (gapSum / currentGaps.length) * 40;
  }

  // Calorie fit
  const remaining = goals.calories;
  const calorieFit = remaining > 0
    ? Math.max(0, 25 * (1 - Math.abs(remaining - recipe.macros.calories) / remaining))
    : 0;

  // Macro fit (protein / carbs / fat only)
  const macroGaps: NutrientGap[] = currentGaps.filter((g) =>
    ["protein", "carbohydrate", "fat"].some((k) => g.nutrientName.toLowerCase().includes(k))
  );
  let macroFit = 0;
  if (macroGaps.length > 0) {
    const macroSum = macroGaps.reduce((sum, gap) => {
      const recipeAmt = recipe.perServing.find((n) => n.nutrientId === gap.nutrientId)?.amount ?? 0;
      return sum + Math.min(recipeAmt / gap.targetAmount, 1);
    }, 0);
    macroFit = (macroSum / macroGaps.length) * 15;
  } else {
    macroFit = 15; // no macro gaps → full score
  }

  const score = clamp(gapImprovement + calorieFit + macroFit, 0, 100);

  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    score,
    breakdown: {
      gapImprovement,
      calorieFit,
      macroFit,
      pantryMatch: 0,
      timeFit: 0,
      excessPenalty: 0,
    },
  };
}

/**
 * Score a recipe for a specific meal slot, taking into account what's already
 * been planned for the day, pantry coverage, and time constraints.
 */
export function scoreRecipeForSlot(
  recipe: RecipeWithNutrition,
  _slot: MealSlot,
  dayState: DayState,
  goals: NutritionGoal,
  references: NutrientReference[],
  pantry: PantryItem[]
): number {
  const perServing = recipe.perServing;

  // ── 1. Nutrient gap improvement (+40) ────────────────────────────────────
  // Compute gaps from current day state
  const upperLimitIds = new Set(
    references.filter((r) => r.limitType === "upper_limit").map((r) => r.nutrientId)
  );
  const targetRefs = references.filter(
    (r) => r.limitType === "target" && r.defaultTarget != null
  );

  let gapImprovement = 0;
  if (targetRefs.length > 0) {
    const gapSum = targetRefs.reduce((sum, ref) => {
      const current = dayState.nutrients.find((n) => n.nutrientId === ref.nutrientId)?.amount ?? 0;
      const target = ref.defaultTarget!;
      if (current >= target) return sum; // already met
      const gap = target - current;
      const recipeAmt = perServing.find((n) => n.nutrientId === ref.nutrientId)?.amount ?? 0;
      return sum + Math.min(recipeAmt / gap, 1);
    }, 0);
    gapImprovement = (gapSum / targetRefs.length) * 40;
  }

  // ── 2. Calorie fit (+25) ─────────────────────────────────────────────────
  const remaining = Math.max(0, goals.calories - dayState.calories);
  const calorieFit = remaining > 0
    ? Math.max(0, 25 * (1 - Math.abs(remaining - recipe.macros.calories) / remaining))
    : 0;

  // ── 3. Macro fit (+15) ───────────────────────────────────────────────────
  const macroKeys: Array<{ key: keyof typeof recipe.macros; target: number }> = [
    { key: "proteinG", target: goals.proteinG },
    { key: "carbsG", target: goals.carbsG },
    { key: "fatG", target: goals.fatG },
  ];
  const macroRemaining = macroKeys.filter(({ key, target }) => {
    const consumed = dayState.nutrients.find((n) =>
      n.nutrientName.toLowerCase().includes(key.replace("G", "").toLowerCase())
    )?.amount ?? 0;
    return consumed < target;
  });

  let macroFit = 0;
  if (macroRemaining.length > 0) {
    const macroSum = macroRemaining.reduce(({ sum }, { key, target }) => {
      const consumed = dayState.nutrients.find((n) =>
        n.nutrientName.toLowerCase().includes(key.replace("G", "").toLowerCase())
      )?.amount ?? 0;
      const gap = Math.max(0, target - consumed);
      const recipeAmt = recipe.macros[key] as number;
      return { sum: sum + Math.min(recipeAmt / (gap || 1), 1) };
    }, { sum: 0 }).sum;
    macroFit = (macroSum / macroRemaining.length) * 15;
  } else {
    macroFit = 15;
  }

  // ── 4. Pantry match (+10) ────────────────────────────────────────────────
  const pantryMatch = hasPantryCoverage(recipe, pantry) ? 10 : 0;

  // ── 5. Time fit (+10) ────────────────────────────────────────────────────
  const totalMins = recipe.prepMins + recipe.cookMins;
  const timeFit = Math.max(0, 10 * (1 - totalMins / MAX_ALLOWED_MINS));

  // ── 6. Upper-limit excess risk (-20) ─────────────────────────────────────
  void upperLimitIds; // used in wouldExceedUpperLimit via references param
  const excessPenalty = wouldExceedUpperLimit(dayState.nutrients, perServing, references) ? -20 : 0;

  return clamp(
    gapImprovement + calorieFit + macroFit + pantryMatch + timeFit + excessPenalty,
    0,
    100
  );
}

/**
 * Sort recipes by score (desc), then apply tie-breaker rules from spec.
 *
 * Tie-breakers (applied in order):
 *   1. isFavorite = true first
 *   2. ≥ 80% pantry coverage first
 *   3. Shortest prepMins + cookMins ascending
 *   4. Highest nutritionScore descending
 *   5. Most recently cooked (lastCookedAt descending)
 */
export function rankRecipes(
  scored: Array<{ recipe: RecipeWithNutrition; score: number }>,
  pantry: PantryItem[]
): Array<{ recipe: RecipeWithNutrition; score: number }> {
  return [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    // 1. Favorite first
    if (a.recipe.isFavorite !== b.recipe.isFavorite)
      return a.recipe.isFavorite ? -1 : 1;

    // 2. Pantry coverage first
    const aCovered = hasPantryCoverage(a.recipe, pantry);
    const bCovered = hasPantryCoverage(b.recipe, pantry);
    if (aCovered !== bCovered) return aCovered ? -1 : 1;

    // 3. Shortest time
    const aTime = a.recipe.prepMins + a.recipe.cookMins;
    const bTime = b.recipe.prepMins + b.recipe.cookMins;
    if (aTime !== bTime) return aTime - bTime;

    // 4. Highest nutrition score
    const aNs = a.recipe.nutritionScore ?? 0;
    const bNs = b.recipe.nutritionScore ?? 0;
    if (aNs !== bNs) return bNs - aNs;

    // 5. Most recently cooked
    const aTs = a.recipe.lastCookedAt?.getTime() ?? 0;
    const bTs = b.recipe.lastCookedAt?.getTime() ?? 0;
    return bTs - aTs;
  });
}
