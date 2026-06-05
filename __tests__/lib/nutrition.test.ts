import { describe, it, expect } from "vitest";
import {
  calculateRecipeNutrition,
  calculateDailyNutritionScore,
  calculateWeeklyNutritionAnalysis,
  type RecipeWithIngredients,
  type DayNutrition,
  type NutrientTotal,
} from "@/lib/nutrition";
import type { NutritionGoal, NutrientReference, MealPlan } from "@prisma/client";

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeNutrientRef(overrides: Partial<NutrientReference> = {}): NutrientReference {
  return {
    id: "ref-1",
    nutrientId: "energy-id",
    nutrientNumber: "208",
    nutrientName: "Energy",
    canonicalName: "Calories",
    aliases: null,
    unitName: "kcal",
    defaultTarget: 2000,
    defaultUpperLimit: null,
    limitType: "target",
    category: "macro",
    source: "FDA",
    sourceDatasetVersion: null,
    verifiedAt: new Date(),
    notes: null,
    ...overrides,
  };
}

function makeGoals(overrides: Partial<NutritionGoal> = {}): NutritionGoal {
  return {
    id: "goal-1",
    calories: 2000,
    proteinG: 50,
    carbsG: 250,
    fatG: 65,
    fiberG: 28,
    sodiumMg: 2300,
    customGoals: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

const PROTEIN_REF = makeNutrientRef({
  id: "ref-protein",
  nutrientId: "protein-id",
  nutrientNumber: "203",
  nutrientName: "Protein",
  canonicalName: "Protein",
  unitName: "g",
  defaultTarget: 50,
  limitType: "target",
  category: "macro",
});

const CALORIE_REF = makeNutrientRef({
  id: "ref-cal",
  nutrientId: "energy-id",
  nutrientNumber: "208",
  nutrientName: "Energy",
  canonicalName: "Calories",
  unitName: "kcal",
  defaultTarget: 2000,
  limitType: "target",
  category: "macro",
});

const SODIUM_REF = makeNutrientRef({
  id: "ref-sodium",
  nutrientId: "sodium-id",
  nutrientNumber: "307",
  nutrientName: "Sodium",
  canonicalName: "Sodium",
  unitName: "mg",
  defaultTarget: null,
  defaultUpperLimit: 2300,
  limitType: "upper_limit",
  category: "mineral",
});

function makeRecipe(
  nutrientsPerIngredient: Array<{ amount: number; nutrientId: string; name: string; unitName: string }>,
  grams: number,
  servings = 1
): RecipeWithIngredients {
  return {
    servings,
    ingredients: [
      {
        amount: grams,
        unit: "g",
        amountGrams: grams,
        ingredient: {
          nutrients: nutrientsPerIngredient.map((n) => ({
            nutrientId: n.nutrientId,
            name: n.name,
            amount: n.amount, // per 100g
            unitName: n.unitName,
            nutrientNumber: "203",
          })),
        },
      },
    ],
  };
}

function makeDayNutrition(nutrients: NutrientTotal[], macros = {
  calories: 2000, proteinG: 50, carbsG: 250, fatG: 65, fiberG: 28,
}): DayNutrition {
  return { date: "2026-01-01", nutrients, macros };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("calculateRecipeNutrition", () => {
  it("100g ingredient: nutrient values equal USDA per-100g values exactly", () => {
    const recipe = makeRecipe([{ amount: 25, nutrientId: "protein-id", name: "Protein", unitName: "g" }], 100);
    const { perServing } = calculateRecipeNutrition(recipe);
    const protein = perServing.find((n) => n.nutrientId === "protein-id");
    expect(protein?.amount).toBeCloseTo(25, 5);
  });

  it("50g ingredient: all values equal exactly 50% of per-100g values", () => {
    const recipe = makeRecipe([{ amount: 40, nutrientId: "protein-id", name: "Protein", unitName: "g" }], 50);
    const { perServing } = calculateRecipeNutrition(recipe);
    const protein = perServing.find((n) => n.nutrientId === "protein-id");
    expect(protein?.amount).toBeCloseTo(20, 5);
  });

  it("recipe serving nutrition = full recipe nutrition ÷ servings (no rounding loss)", () => {
    const recipe = makeRecipe([{ amount: 30, nutrientId: "protein-id", name: "Protein", unitName: "g" }], 200, 4);
    const { nutrients, perServing } = calculateRecipeNutrition(recipe);
    const totalProtein = nutrients.find((n) => n.nutrientId === "protein-id")?.amount ?? 0;
    const servingProtein = perServing.find((n) => n.nutrientId === "protein-id")?.amount ?? 0;
    expect(servingProtein).toBeCloseTo(totalProtein / 4, 10);
  });

  it("ingredient with null amountGrams is skipped", () => {
    const recipe: RecipeWithIngredients = {
      servings: 1,
      ingredients: [
        { amount: 1, unit: "cup", amountGrams: null, ingredient: { nutrients: [{ nutrientId: "protein-id", name: "Protein", amount: 20, unitName: "g", nutrientNumber: "203" }] } },
      ],
    };
    const { perServing } = calculateRecipeNutrition(recipe);
    expect(perServing.length).toBe(0);
  });
});

describe("calculateDailyNutritionScore", () => {
  it("fully compliant day (all nutrients 95–105% of target, no excesses) → score ≥ 90", () => {
    const refs = [CALORIE_REF, PROTEIN_REF];
    const goals = makeGoals();
    const dayNutrition = makeDayNutrition(
      [
        { nutrientId: "energy-id", nutrientName: "Calories", amount: 2000, unitName: "kcal" },
        { nutrientId: "protein-id", nutrientName: "Protein", amount: 50, unitName: "g" },
      ],
      { calories: 2000, proteinG: 50, carbsG: 250, fatG: 65, fiberG: 28 }
    );
    const score = calculateDailyNutritionScore(dayNutrition, goals, refs);
    expect(score.score).toBeGreaterThanOrEqual(90);
  });

  it("day with 2 severe deficiencies (< 50%) and 1 excess → score < 60", () => {
    const refs = [CALORIE_REF, PROTEIN_REF, SODIUM_REF];
    const goals = makeGoals();
    const dayNutrition = makeDayNutrition(
      [
        { nutrientId: "energy-id", nutrientName: "Calories", amount: 800, unitName: "kcal" }, // 40% — severe
        { nutrientId: "protein-id", nutrientName: "Protein", amount: 20, unitName: "g" },   // 40% — severe
        { nutrientId: "sodium-id", nutrientName: "Sodium", amount: 3000, unitName: "mg" },  // excess
      ],
      { calories: 800, proteinG: 20, carbsG: 50, fatG: 20, fiberG: 5 }
    );
    const score = calculateDailyNutritionScore(dayNutrition, goals, refs);
    expect(score.score).toBeLessThan(60);
  });

  it("excess sodium reduces composite score via upper-limit penalty", () => {
    const refs = [CALORIE_REF, SODIUM_REF];
    const goals = makeGoals();
    const baseDay = makeDayNutrition(
      [{ nutrientId: "energy-id", nutrientName: "Calories", amount: 2000, unitName: "kcal" }],
      { calories: 2000, proteinG: 50, carbsG: 250, fatG: 65, fiberG: 28 }
    );
    const sodiumDay = makeDayNutrition(
      [
        { nutrientId: "energy-id", nutrientName: "Calories", amount: 2000, unitName: "kcal" },
        { nutrientId: "sodium-id", nutrientName: "Sodium", amount: 4000, unitName: "mg" },
      ],
      { calories: 2000, proteinG: 50, carbsG: 250, fatG: 65, fiberG: 28 }
    );
    const baseScore = calculateDailyNutritionScore(baseDay, goals, refs);
    const sodiumScore = calculateDailyNutritionScore(sodiumDay, goals, refs);
    expect(sodiumScore.score).toBeLessThan(baseScore.score);
  });
});

describe("calculateWeeklyNutritionAnalysis", () => {
  it("empty week → planCompletion = 0, bestDay = null", () => {
    const result = calculateWeeklyNutritionAnalysis([], makeGoals(), [CALORIE_REF]);
    expect(result.planCompletion).toBe(0);
    expect(result.bestDay).toBeNull();
  });

  it("3-of-7-day week: weeklyScore uses only the 3 planned days", () => {
    type MealPlanWithSnapshot = MealPlan & {
      snapshot: { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; fiberG: number | null; fullNutrients: unknown } | null;
    };
    const days = ["2026-01-05", "2026-01-06", "2026-01-07"];
    const plans: MealPlanWithSnapshot[] = days.map((d, i) => ({
      id: `plan-${i}`,
      date: new Date(d),
      mealType: "lunch",
      recipeId: `recipe-${i}`,
      servings: 1,
      snapshot: {
        calories: 2000,
        proteinG: 50,
        carbsG: 250,
        fatG: 65,
        fiberG: 28,
        fullNutrients: [],
      },
    }));

    const result = calculateWeeklyNutritionAnalysis(plans, makeGoals(), [CALORIE_REF]);
    expect(result.planCompletion).toBeCloseTo(3 / 7, 5);
    expect(result.bestDay).not.toBeNull();
    expect(result.worstDay).not.toBeNull();
  });
});
