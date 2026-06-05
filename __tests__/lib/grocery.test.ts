import { describe, it, expect } from "vitest";
import { generateGroceryList, pantryNameSimilarity, type GroceryIngredient } from "@/lib/grocery";
import type { PantryItem, IngredientDensity } from "@prisma/client";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WEEK_START = new Date("2026-01-05T00:00:00.000Z");

function makePantry(name: string, amountGrams: number): PantryItem {
  return {
    id: name, ingredientId: name, name, amount: amountGrams, unit: "g",
    amountGrams, category: null, expiresAt: null, notes: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
}

function makeIngredient(
  name: string, grams: number | null, recipeId = "recipe-1", id = name
): GroceryIngredient {
  return { ingredientId: id, ingredientName: name, amountGrams: grams, recipeId };
}

const FLOUR_DENSITY: IngredientDensity = {
  id: "flour", ingredientName: "flour", gramsPerCup: 120, gramsPerTablespoon: 7.5,
  gramsPerTeaspoon: 2.5, gramsPerPiece: null, gramsPerMl: null, notes: null, source: "seeded",
};
const BUTTER_DENSITY: IngredientDensity = {
  id: "butter", ingredientName: "butter", gramsPerCup: 227, gramsPerTablespoon: 14.2,
  gramsPerTeaspoon: 4.7, gramsPerPiece: null, gramsPerMl: null, notes: null, source: "seeded",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateGroceryList", () => {
  it("500g oats in pantry + 700g needed → coveredByPantryGrams=500, remainingToBuyGrams=200", () => {
    const ingredients = [makeIngredient("oats", 700)];
    const pantry = [makePantry("oats", 500)];
    const result = generateGroceryList(WEEK_START, ingredients, pantry, []);

    expect(result).toHaveLength(1);
    expect(result[0].coveredByPantryGrams).toBe(500);
    expect(result[0].remainingToBuyGrams).toBe(200);
    expect(result[0].fromPantry).toBe(false);
  });

  it("600g butter in pantry + 500g needed → remainingToBuyGrams=0, fromPantry=true", () => {
    const ingredients = [makeIngredient("butter", 500)];
    const pantry = [makePantry("butter", 600)];
    const result = generateGroceryList(WEEK_START, ingredients, pantry, [BUTTER_DENSITY]);

    expect(result).toHaveLength(1);
    expect(result[0].remainingToBuyGrams).toBe(0);
    expect(result[0].fromPantry).toBe(true);
  });

  it("two recipes both requiring chicken → consolidated item with both recipe IDs", () => {
    const ingredients = [
      makeIngredient("chicken breast", 300, "recipe-1", "chkn"),
      makeIngredient("chicken breast", 200, "recipe-2", "chkn"),
    ];
    const result = generateGroceryList(WEEK_START, ingredients, [], []);

    expect(result).toHaveLength(1);
    expect(result[0].totalGrams).toBe(500);
    expect(result[0].sourceRecipeIds).toContain("recipe-1");
    expect(result[0].sourceRecipeIds).toContain("recipe-2");
  });

  it("ingredient with null amountGrams → totalGrams=null, remainingToBuyGrams=null", () => {
    const ingredients = [makeIngredient("mystery herb", null)];
    const result = generateGroceryList(WEEK_START, ingredients, [], []);

    expect(result).toHaveLength(1);
    expect(result[0].totalGrams).toBeNull();
    expect(result[0].remainingToBuyGrams).toBeNull();
  });

  it("pantry name mismatch (similarity < 0.8) → no subtraction applied", () => {
    const ingredients = [makeIngredient("all-purpose flour", 500)];
    // "cornstarch" is dissimilar to "all-purpose flour"
    const pantry = [makePantry("cornstarch", 1000)];
    const result = generateGroceryList(WEEK_START, ingredients, pantry, [FLOUR_DENSITY]);

    expect(result[0].coveredByPantryGrams).toBeFalsy();
    expect(result[0].remainingToBuyGrams).toBe(500);
  });

  it("empty ingredient list → returns empty array", () => {
    const result = generateGroceryList(WEEK_START, [], [], []);
    expect(result).toHaveLength(0);
  });

  it("'spinach' → category='produce'; 'cheddar cheese' → category='dairy'", () => {
    const ingredients = [
      makeIngredient("spinach", 100, "r1", "sp"),
      makeIngredient("cheddar cheese", 100, "r1", "ch"),
    ];
    const result = generateGroceryList(WEEK_START, ingredients, [], []);
    const spinach = result.find((i) => i.ingredientName === "spinach");
    const cheddar = result.find((i) => i.ingredientName === "cheddar cheese");
    expect(spinach?.category).toBe("produce");
    expect(cheddar?.category).toBe("dairy");
  });
});

describe("pantryNameSimilarity", () => {
  it("exact match → 1.0", () => {
    expect(pantryNameSimilarity("oats", "oats")).toBe(1);
  });

  it("'rolled oats' vs 'oats' → above 0.5", () => {
    expect(pantryNameSimilarity("rolled oats", "oats")).toBeGreaterThan(0.5);
  });

  it("'butter' vs 'cornstarch' → below 0.8", () => {
    expect(pantryNameSimilarity("butter", "cornstarch")).toBeLessThan(0.8);
  });
});
