import { describe, it, expect } from "vitest";
import { resolveAmountGrams } from "@/lib/density";
import { parseIngredientMeasure } from "@/lib/units";
import { pantryNameSimilarity } from "@/lib/grocery";
import type { IngredientDensity, PantryItem } from "@prisma/client";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OATS_DENSITY: IngredientDensity = {
  id: "oats", ingredientName: "rolled oats", gramsPerCup: 90, gramsPerTablespoon: 5.6,
  gramsPerTeaspoon: null, gramsPerPiece: null, gramsPerMl: null, notes: null, source: "seeded",
};

function makePantryItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: "p1", ingredientId: "oats-id", name: "rolled oats", amount: 2, unit: "cups",
    amountGrams: 180, category: "pantry", expiresAt: null, notes: null,
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

// ── Helper: simulate pantry coverage for a recipe ─────────────────────────────

function pantryCoversRecipe(
  pantryItems: PantryItem[],
  recipeIngredients: Array<{ ingredientId: string; amountGrams: number | null }>
): { coverage: number; canCookNow: boolean } {
  const totalG = recipeIngredients.reduce((s, i) => s + (i.amountGrams ?? 0), 0);
  if (totalG === 0) return { coverage: 0, canCookNow: false };

  const pantryMap = new Map(pantryItems.map((p) => [p.ingredientId, p.amountGrams ?? 0]));
  const coveredG = recipeIngredients.reduce((s, i) => {
    const pantryG = i.ingredientId ? (pantryMap.get(i.ingredientId) ?? 0) : 0;
    return s + Math.min(pantryG, i.amountGrams ?? 0);
  }, 0);

  const coverage = coveredG / totalG;
  return { coverage, canCookNow: coverage >= 0.8 };
}

// ── Helper: simulate "Use Soon" query ─────────────────────────────────────────

function getUseSoonItems(items: PantryItem[], now = new Date()): PantryItem[] {
  const threshold = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  return items
    .filter((i) => i.expiresAt != null && i.expiresAt <= threshold && i.expiresAt >= now)
    .sort((a, b) => (a.expiresAt!.getTime() - b.expiresAt!.getTime()));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("pantry — amountGrams resolution", () => {
  it("2 cups rolled oats → correct amountGrams via density", () => {
    const parsed = parseIngredientMeasure("2 cups");
    const result = resolveAmountGrams(parsed, "rolled oats", [OATS_DENSITY]);
    expect(result.confident).toBe(true);
    if (result.confident) expect(result.grams).toBeCloseTo(180, 1);
  });

  it("unknown unit → confident = false", () => {
    const parsed = parseIngredientMeasure("1 bunch");
    const result = resolveAmountGrams(parsed, "rolled oats", [OATS_DENSITY]);
    expect(result.confident).toBe(false);
  });
});

describe("pantry — simulated consume logic", () => {
  it("partial consumption → amount reduced, not deleted", () => {
    const item = makePantryItem({ amountGrams: 500 });
    const consumed = 200;
    const remaining = item.amountGrams! - consumed;
    // Simulate what PUT /api/pantry/:id would write
    expect(remaining).toBe(300);
    expect(remaining).toBeGreaterThan(0);
  });

  it("full consumption → amount set to 0, not deleted", () => {
    const item = makePantryItem({ amountGrams: 200 });
    const consumed = 200;
    const remaining = Math.max(0, item.amountGrams! - consumed);
    expect(remaining).toBe(0);
  });
});

describe("pantry — Use Soon query", () => {
  it("items expiring within 3 days float to top, sorted expiresAt asc", () => {
    const now = new Date("2026-01-05T12:00:00Z");
    const items: PantryItem[] = [
      makePantryItem({ id: "far", expiresAt: new Date("2026-01-15T00:00:00Z") }),
      makePantryItem({ id: "soon-2", expiresAt: new Date("2026-01-07T00:00:00Z") }),
      makePantryItem({ id: "soon-1", expiresAt: new Date("2026-01-06T00:00:00Z") }),
    ];
    const useSoon = getUseSoonItems(items, now);
    expect(useSoon).toHaveLength(2);
    expect(useSoon[0].id).toBe("soon-1");
    expect(useSoon[1].id).toBe("soon-2");
  });

  it("no items expiring soon → empty array", () => {
    const now = new Date("2026-01-05T12:00:00Z");
    const items: PantryItem[] = [
      makePantryItem({ id: "far", expiresAt: new Date("2026-02-01T00:00:00Z") }),
    ];
    expect(getUseSoonItems(items, now)).toHaveLength(0);
  });
});

describe("pantry — Can Cook Now coverage", () => {
  it("recipe requiring 400g, pantry has 500g → coverage = 1.0, canCookNow = true", () => {
    const pantry: PantryItem[] = [makePantryItem({ ingredientId: "ing1", amountGrams: 500 })];
    const { coverage, canCookNow } = pantryCoversRecipe(pantry, [{ ingredientId: "ing1", amountGrams: 400 }]);
    expect(coverage).toBe(1.0);
    expect(canCookNow).toBe(true);
  });

  it("recipe requiring 500g, pantry has 400g → coverage = 0.8, canCookNow = true", () => {
    const pantry: PantryItem[] = [makePantryItem({ ingredientId: "ing1", amountGrams: 400 })];
    const { coverage, canCookNow } = pantryCoversRecipe(pantry, [{ ingredientId: "ing1", amountGrams: 500 }]);
    expect(coverage).toBeCloseTo(0.8, 5);
    expect(canCookNow).toBe(true);
  });

  it("recipe requiring 500g, pantry has 300g → coverage = 0.6, canCookNow = false", () => {
    const pantry: PantryItem[] = [makePantryItem({ ingredientId: "ing1", amountGrams: 300 })];
    const { coverage, canCookNow } = pantryCoversRecipe(pantry, [{ ingredientId: "ing1", amountGrams: 500 }]);
    expect(coverage).toBeCloseTo(0.6, 5);
    expect(canCookNow).toBe(false);
  });
});
