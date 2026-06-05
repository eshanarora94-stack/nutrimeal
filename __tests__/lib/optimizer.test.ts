import { describe, it, expect } from "vitest";
import {
  scoreRecipeForSlot,
  rankRecipes,
  type RecipeWithNutrition,
  type MealSlot,
  type DayState,
} from "@/lib/optimizer";
import type { NutritionGoal, NutrientReference, PantryItem } from "@prisma/client";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeGoals(overrides: Partial<NutritionGoal> = {}): NutritionGoal {
  return {
    id: "g1", calories: 2000, proteinG: 50, carbsG: 250, fatG: 65,
    fiberG: 28, sodiumMg: 2300, customGoals: null, updatedAt: new Date(), ...overrides,
  };
}

function makeRef(overrides: Partial<NutrientReference>): NutrientReference {
  return {
    id: "r1", nutrientId: "n1", nutrientNumber: "203", nutrientName: "Protein",
    canonicalName: "Protein", aliases: null, unitName: "g", defaultTarget: 50,
    defaultUpperLimit: null, limitType: "target", category: "macro", source: "FDA",
    sourceDatasetVersion: null, verifiedAt: new Date(), notes: null, ...overrides,
  };
}

function makeRecipe(overrides: Partial<RecipeWithNutrition> = {}): RecipeWithNutrition {
  return {
    id: "r1", name: "Test Recipe", prepMins: 10, cookMins: 20, servings: 2,
    isFavorite: false, nutritionScore: 70, lastCookedAt: null,
    perServing: [],
    macros: { calories: 400, proteinG: 30, carbsG: 40, fatG: 15 },
    ingredientWeightG: 300,
    ingredients: [{ ingredientId: "ing1", amountGrams: 300 }],
    ...overrides,
  };
}

const SLOT: MealSlot = { date: "2026-01-01", mealType: "lunch" };
const EMPTY_DAY: DayState = { calories: 0, nutrients: [] };
const NO_PANTRY: PantryItem[] = [];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("scoreRecipeForSlot", () => {
  it("recipe closing ~80% of protein gap scores high on gap component", () => {
    const proteinRef = makeRef({ nutrientId: "prot-id", limitType: "target", defaultTarget: 50 });
    const recipe = makeRecipe({
      perServing: [{ nutrientId: "prot-id", nutrientName: "Protein", amount: 40, unitName: "g" }],
    });
    // Day has 0 protein so far — gap is full 50g, recipe provides 40g (80%)
    const score = scoreRecipeForSlot(recipe, SLOT, EMPTY_DAY, makeGoals(), [proteinRef], NO_PANTRY);
    // gap component alone = (40/50) * 40 = 32; total should be well above 0
    expect(score).toBeGreaterThan(20);
  });

  it("recipe pushing sodium above daily limit → receives -20 penalty", () => {
    const sodiumRef = makeRef({
      nutrientId: "sod-id", nutrientName: "Sodium", limitType: "upper_limit",
      defaultTarget: null, defaultUpperLimit: 2300,
    });
    const recipeWithHighSodium = makeRecipe({
      perServing: [{ nutrientId: "sod-id", nutrientName: "Sodium", amount: 3000, unitName: "mg" }],
    });
    const dayAlreadyAtLimit: DayState = {
      calories: 0,
      nutrients: [{ nutrientId: "sod-id", nutrientName: "Sodium", amount: 2300, unitName: "mg" }],
    };
    // With -20 penalty and no other positive signals this score should be very low
    const score = scoreRecipeForSlot(
      recipeWithHighSodium, SLOT, dayAlreadyAtLimit, makeGoals(), [sodiumRef], NO_PANTRY
    );
    // Penalty fires — score must be lower than without it
    const scoreWithoutSodium = scoreRecipeForSlot(
      makeRecipe(), SLOT, EMPTY_DAY, makeGoals(), [sodiumRef], NO_PANTRY
    );
    expect(score).toBeLessThan(scoreWithoutSodium);
  });

  it("recipe with ≥80% pantry coverage receives +10 pantry bonus", () => {
    const pantry: PantryItem[] = [{
      id: "p1", ingredientId: "ing1", name: "chicken", amount: 300, unit: "g",
      amountGrams: 300, category: "meat", expiresAt: null, notes: null,
      createdAt: new Date(), updatedAt: new Date(),
    }];
    const recipe = makeRecipe({ ingredients: [{ ingredientId: "ing1", amountGrams: 300 }], ingredientWeightG: 300 });

    const withPantry = scoreRecipeForSlot(recipe, SLOT, EMPTY_DAY, makeGoals(), [], pantry);
    const withoutPantry = scoreRecipeForSlot(recipe, SLOT, EMPTY_DAY, makeGoals(), [], NO_PANTRY);
    expect(withPantry - withoutPantry).toBeCloseTo(10, 0);
  });

  it("recipe with totalTime = 180 (> maxAllowedMins=120) → 0 on time-fit component", () => {
    const recipe = makeRecipe({ prepMins: 90, cookMins: 90 }); // 180 total
    // time-fit = max(0, 10*(1-180/120)) = max(0, -5) = 0
    // Score without time-fit component should equal score with it (since clamped to 0)
    const score = scoreRecipeForSlot(recipe, SLOT, EMPTY_DAY, makeGoals(), [], NO_PANTRY);
    const fastRecipe = makeRecipe({ prepMins: 0, cookMins: 0 });
    const fastScore = scoreRecipeForSlot(fastRecipe, SLOT, EMPTY_DAY, makeGoals(), [], NO_PANTRY);
    // Fast recipe should score at least 10 higher (the time-fit component)
    expect(fastScore - score).toBeGreaterThanOrEqual(9.9);
  });
});

describe("rankRecipes", () => {
  it("isFavorite = true ranks first on tie", () => {
    const base = makeRecipe({ id: "r1", isFavorite: false });
    const fav = makeRecipe({ id: "r2", isFavorite: true });
    const scored = [
      { recipe: base, score: 50 },
      { recipe: fav, score: 50 }, // same score
    ];
    const ranked = rankRecipes(scored, NO_PANTRY);
    expect(ranked[0].recipe.id).toBe("r2");
  });

  it("empty recipe library → returns empty array", () => {
    const ranked = rankRecipes([], NO_PANTRY);
    expect(ranked).toHaveLength(0);
  });

  it("higher nutritionScore wins tie-break after pantry and favorite checks", () => {
    const low = makeRecipe({ id: "low", isFavorite: false, nutritionScore: 40 });
    const high = makeRecipe({ id: "high", isFavorite: false, nutritionScore: 80 });
    const scored = [
      { recipe: low, score: 60 },
      { recipe: high, score: 60 },
    ];
    const ranked = rankRecipes(scored, NO_PANTRY);
    expect(ranked[0].recipe.id).toBe("high");
  });
});
