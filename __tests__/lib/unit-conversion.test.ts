import { describe, it, expect } from "vitest";
import { parseIngredientMeasure, convertStandardUnit, normalizeUnit } from "@/lib/units";
import { resolveAmountGrams } from "@/lib/density";
import type { IngredientDensity } from "@prisma/client";

// ── Minimal density fixture (mirrors seeded values) ───────────────────────────

function makeDensity(name: string, overrides: Partial<IngredientDensity> = {}): IngredientDensity {
  return {
    id: name,
    ingredientName: name,
    gramsPerCup: null,
    gramsPerTablespoon: null,
    gramsPerTeaspoon: null,
    gramsPerPiece: null,
    gramsPerMl: null,
    notes: null,
    source: "seeded",
    ...overrides,
  };
}

const FLOUR_DENSITY = makeDensity("all-purpose flour", { gramsPerCup: 120, gramsPerTablespoon: 7.5, gramsPerTeaspoon: 2.5 });
const OLIVE_OIL_DENSITY = makeDensity("olive oil", { gramsPerMl: 0.911, gramsPerTablespoon: 13.5 });
const EGG_DENSITY = makeDensity("egg", { gramsPerPiece: 50 });
const OATS_DENSITY = makeDensity("rolled oats", { gramsPerCup: 90, gramsPerTablespoon: 5.6 });
const HONEY_DENSITY = makeDensity("honey", { gramsPerTablespoon: 21, gramsPerTeaspoon: 7 });

const ALL_DENSITIES = [FLOUR_DENSITY, OLIVE_OIL_DENSITY, EGG_DENSITY, OATS_DENSITY, HONEY_DENSITY];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("resolveAmountGrams — seeded densities", () => {
  it("1 cup all-purpose flour → 120g", () => {
    const parsed = parseIngredientMeasure("1 cup");
    const result = resolveAmountGrams(parsed, "all-purpose flour", ALL_DENSITIES);
    expect(result.confident).toBe(true);
    if (result.confident) expect(result.grams).toBeCloseTo(120, 1);
  });

  it("1 tablespoon olive oil → ~13.5g", () => {
    const parsed = parseIngredientMeasure("1 tablespoon");
    const result = resolveAmountGrams(parsed, "olive oil", ALL_DENSITIES);
    expect(result.confident).toBe(true);
    if (result.confident) expect(result.grams).toBeCloseTo(13.5, 0);
  });

  it("1 egg → 50g via gramsPerPiece", () => {
    const parsed = parseIngredientMeasure("1 piece");
    const result = resolveAmountGrams(parsed, "egg", ALL_DENSITIES);
    expect(result.confident).toBe(true);
    if (result.confident) expect(result.grams).toBeCloseTo(50, 1);
  });

  it("1.5 cups oats → 1.5 × gramsPerCup", () => {
    const parsed = parseIngredientMeasure("1.5 cups");
    const result = resolveAmountGrams(parsed, "rolled oats", ALL_DENSITIES);
    expect(result.confident).toBe(true);
    if (result.confident) expect(result.grams).toBeCloseTo(1.5 * 90, 1);
  });

  it("200g chicken → 200g, confident = true, no density lookup needed", () => {
    const parsed = parseIngredientMeasure("200 g");
    const result = resolveAmountGrams(parsed, "chicken breast raw", []); // no densities
    expect(result.confident).toBe(true);
    if (result.confident) {
      expect(result.grams).toBeCloseTo(200, 5);
      expect(result.method).toBe("weight_passthrough");
    }
  });

  it("unknown ingredient → confident = false, grams = null", () => {
    const parsed = parseIngredientMeasure("1 cup");
    const result = resolveAmountGrams(parsed, "mystery ingredient xyz", []);
    expect(result.confident).toBe(false);
    if (!result.confident) expect(result.grams).toBeNull();
  });
});

describe("parseIngredientMeasure", () => {
  it("'2½ tbsp honey' → amount = 2.5, unit = 'Tbs'", () => {
    const result = parseIngredientMeasure("2½ tbsp");
    expect(result.amount).toBeCloseTo(2.5, 5);
    expect(result.unit).toBe("Tbs");
    expect(result.confident).toBe(true);
  });

  it("'1 bunch spinach' → confident = false (ambiguous unit)", () => {
    const result = parseIngredientMeasure("1 bunch");
    expect(result.confident).toBe(false);
  });
});

describe("convertStandardUnit", () => {
  it("1 cup → 236.588 ml (volume→volume, not grams)", () => {
    const result = convertStandardUnit(1, "cup", "ml");
    expect(result.success).toBe(true);
    if (result.success) expect(result.amount).toBeCloseTo(236.588, 1);
  });

  it("mass → volume returns incompatible_dimensions error", () => {
    const result = convertStandardUnit(1, "cup", "g");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("incompatible_dimensions");
  });

  it("normalizeUnit correctly identifies tablespoon dimension", () => {
    const result = normalizeUnit("tablespoon");
    expect(result.dimension).toBe("volume");
    expect(result.canonical).toBe("Tbs");
  });
});
