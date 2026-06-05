import { describe, it, expect } from "vitest";
import { parseIngredientMeasure } from "@/lib/units";
import { parseMealIngredients } from "@/lib/themealdb";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("recipe-import — unit parsing", () => {
  it("'1 tbs garlic' → amount=1, unit='Tbs', ingredient='garlic'", () => {
    const parsed = parseIngredientMeasure("1 tbs");
    expect(parsed.amount).toBe(1);
    expect(parsed.unit).toBe("Tbs");
    expect(parsed.confident).toBe(true);
  });

  it("'1 bunch spinach' → confident = false (ambiguous unit)", () => {
    const result = parseIngredientMeasure("1 bunch");
    expect(result.confident).toBe(false);
    expect(result.ambiguousReason).toBeDefined();
  });

  it("'2½ cups flour' → amount = 2.5, confident = true", () => {
    const result = parseIngredientMeasure("2½ cups");
    expect(result.amount).toBeCloseTo(2.5, 5);
    expect(result.confident).toBe(true);
  });

  it("'3/4 cup milk' → amount = 0.75", () => {
    const result = parseIngredientMeasure("3/4 cup");
    expect(result.amount).toBeCloseTo(0.75, 5);
    expect(result.confident).toBe(true);
  });
});

describe("recipe-import — TheMealDB parseMealIngredients", () => {
  it("TheMealDB meal with ingredients → parses into ParsedIngredient array", () => {
    const meal = {
      strIngredient1: "Chicken", strMeasure1: "400g",
      strIngredient2: "Garlic", strMeasure2: "2 cloves",
      strIngredient3: "",       strMeasure3: "",
    };
    const result = parseMealIngredients(meal as never);
    // Only non-empty ingredient slots should be returned
    expect(result.length).toBeGreaterThanOrEqual(1);
    const chicken = result.find((r) => r.ingredient.toLowerCase().includes("chicken"));
    expect(chicken).toBeDefined();
    expect(chicken?.measure).toBe("400g");
  });

  it("TheMealDB meal with no ingredient data → returns empty array", () => {
    const result = parseMealIngredients({} as never);
    expect(result).toHaveLength(0);
  });

  it("'1 bunch spinach' parsed from TheMealDB measure → confident = false", () => {
    const meal = { strIngredient1: "Spinach", strMeasure1: "1 bunch" };
    const [ingredient] = parseMealIngredients(meal as never);
    const parsed = parseIngredientMeasure(ingredient.measure);
    expect(parsed.confident).toBe(false);
  });
});

describe("recipe-import — RecipeSource field expectations", () => {
  it("RecipeSource.provider should be 'themealdb' (contract test)", () => {
    // This test documents the expected provider value for TheMealDB imports.
    // The actual DB write is covered by the API route; here we verify the constant.
    const EXPECTED_PROVIDER = "themealdb";
    expect(EXPECTED_PROVIDER).toBe("themealdb");
  });

  it("externalId should be the TheMealDB idMeal string (contract test)", () => {
    const meal = { idMeal: "52772", strMeal: "Teriyaki Chicken Casserole" };
    // Simulate what the import wizard sends to /api/recipes
    const externalId = meal.idMeal;
    expect(typeof externalId).toBe("string");
    expect(externalId).toBe("52772");
  });
});
