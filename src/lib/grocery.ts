/**
 * lib/grocery.ts
 *
 * Grocery list generation pipeline.
 *
 * Pipeline (per spec):
 *   1. For each MealPlan in the week: fetch RecipeIngredients, scale by servings
 *   2. Subtract pantry stock (Levenshtein confidence ≥ 0.8 required for match)
 *   3. Consolidate: sum remainingToBuyGrams for same ingredient
 *   4. Convert back to user-friendly display unit
 *   5. Assign aisle category
 *   6. Return GroceryListItem-shaped records (caller writes to DB)
 *
 * Pantry subtraction rules (from spec):
 *   Full coverage  → remainingToBuyGrams = 0,           fromPantry = true
 *   Partial        → remainingToBuyGrams = req - pantry, fromPantry = false
 *   No density     → remainingToBuyGrams = null,         totalGrams = null
 *   Lev < 0.8      → no subtraction applied, console.warn
 */

import type { PantryItem, IngredientDensity } from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GroceryIngredient {
  ingredientId: string;
  ingredientName: string;
  amountGrams: number | null;
  recipeId: string;
}

export interface GroceryListItemInput {
  weekStartDate: Date;
  ingredientName: string;
  ingredientId: string | null;
  category: string | null;
  totalAmount: number | null;
  totalUnit: string | null;
  totalGrams: number | null;
  displayText: string;
  isChecked: boolean;
  fromPantry: boolean;
  sourceRecipeIds: string[];
  coveredByPantryGrams: number | null;
  remainingToBuyGrams: number | null;
}

// ── Levenshtein helpers ───────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function wordDice(a: string, b: string): number {
  const wordsA = a.split(/\s+/).filter(Boolean);
  const wordsB = new Set(b.split(/\s+/).filter(Boolean));
  const intersection = wordsA.filter((w) => wordsB.has(w)).length;
  const total = wordsA.length + wordsB.size;
  if (total === 0) return 1;
  return (2 * intersection) / total;
}

function similarity(a: string, b: string): number {
  const al = a.toLowerCase(), bl = b.toLowerCase();
  const maxLen = Math.max(al.length, bl.length);
  const levScore = maxLen === 0 ? 1 : 1 - levenshtein(al, bl) / maxLen;
  const diceScore = wordDice(al, bl);
  return Math.max(levScore, diceScore);
}

/** Find best pantry match with confidence ≥ 0.8, or null. */
function findPantryMatch(
  name: string,
  pantry: PantryItem[]
): PantryItem | null {
  let best: PantryItem | null = null;
  let bestScore = 0;
  for (const item of pantry) {
    const score = similarity(name, item.name);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  if (bestScore >= 0.8) return best;
  if (bestScore > 0 && bestScore < 0.8) {
    console.warn(
      `[grocery] Pantry mismatch for "${name}": best match "${best?.name}" (${(bestScore * 100).toFixed(0)}% < 80%) — skipping subtraction`
    );
  }
  return null;
}

// ── Aisle category assignment ─────────────────────────────────────────────────

const PRODUCE_KEYWORDS = [
  "spinach", "broccoli", "onion", "garlic", "potato", "tomato", "carrot",
  "bell pepper", "mushroom", "lettuce", "celery", "cucumber", "zucchini",
  "kale", "arugula", "cabbage", "corn", "pea", "green bean", "asparagus",
  "avocado", "lemon", "lime", "apple", "banana", "berry", "fruit", "vegetable",
];
const MEAT_KEYWORDS = [
  "chicken", "beef", "pork", "turkey", "lamb", "salmon", "tuna", "shrimp",
  "fish", "steak", "ground", "sausage", "bacon", "ham", "seafood",
];
const DAIRY_KEYWORDS = [
  "milk", "cream", "butter", "cheese", "yogurt", "cheddar", "mozzarella",
  "parmesan", "sour cream", "cottage cheese", "egg",
];
const BAKERY_KEYWORDS = [
  "bread", "bun", "roll", "bagel", "muffin", "croissant", "tortilla", "pita",
];
const FROZEN_KEYWORDS = ["frozen", "ice cream", "sorbet"];
const SPICE_KEYWORDS = [
  "salt", "pepper", "cumin", "paprika", "oregano", "thyme", "basil", "cinnamon",
  "turmeric", "ginger", "chili", "cayenne", "curry", "spice", "herb",
];
const BEVERAGE_KEYWORDS = [
  "juice", "soda", "water", "coffee", "tea", "wine", "beer", "broth", "stock",
];

function assignAisle(name: string): string {
  const n = name.toLowerCase();
  if (FROZEN_KEYWORDS.some((k) => n.includes(k))) return "frozen";
  if (PRODUCE_KEYWORDS.some((k) => n.includes(k))) return "produce";
  if (MEAT_KEYWORDS.some((k) => n.includes(k))) return "meat";
  if (DAIRY_KEYWORDS.some((k) => n.includes(k))) return "dairy";
  if (BAKERY_KEYWORDS.some((k) => n.includes(k))) return "bakery";
  if (SPICE_KEYWORDS.some((k) => n.includes(k))) return "spices";
  if (BEVERAGE_KEYWORDS.some((k) => n.includes(k))) return "beverages";
  return "pantry";
}

// ── User-friendly display unit ────────────────────────────────────────────────

function toDisplayText(name: string, totalGrams: number | null, densities: IngredientDensity[]): string {
  if (totalGrams === null) return name + " (weight unknown)";
  if (totalGrams < 5) return `${Math.round(totalGrams * 10) / 10}g ${name}`;

  // Try to find a friendly unit
  const density = densities.find((d) => similarity(d.ingredientName, name.toLowerCase()) >= 0.7);

  if (density) {
    // Prefer cup if gramsPerCup available and result is ≥ 0.25 cup
    if (density.gramsPerCup) {
      const cups = totalGrams / density.gramsPerCup;
      if (cups >= 0.25) {
        const rounded = Math.round(cups * 4) / 4; // nearest 0.25
        return `${rounded} cup${rounded !== 1 ? "s" : ""} ${name}`;
      }
    }
    if (density.gramsPerTablespoon) {
      const tbsp = totalGrams / density.gramsPerTablespoon;
      if (tbsp >= 1) {
        const rounded = Math.round(tbsp * 2) / 2;
        return `${rounded} tbsp ${name}`;
      }
    }
  }

  // Fallback: grams or kg
  if (totalGrams >= 1000) {
    return `${Math.round(totalGrams / 100) / 10}kg ${name}`;
  }
  return `${Math.round(totalGrams)}g ${name}`;
}

// ── Main pipeline function ────────────────────────────────────────────────────

/**
 * Generate a grocery list for the week.
 *
 * @param weekStartDate  Monday of the week (used as the list key)
 * @param ingredients    All scaled ingredients across all meal plans for the week
 * @param pantryItems    Current pantry state
 * @param densities      IngredientDensity records for display-unit conversion
 */
export function generateGroceryList(
  weekStartDate: Date,
  ingredients: GroceryIngredient[],
  pantryItems: PantryItem[],
  densities: IngredientDensity[]
): GroceryListItemInput[] {
  // ── Step 1 & 2: aggregate by ingredient, subtract pantry ─────────────────

  interface Accumulator {
    ingredientId: string | null;
    ingredientName: string;
    totalRequiredGrams: number | null;  // null if any amountGrams was null
    coveredByPantryGrams: number;
    sourceRecipeIds: string[];
    hasUnknownWeight: boolean;
  }

  const byIngredient = new Map<string, Accumulator>();

  for (const ing of ingredients) {
    // Key: prefer ingredientId, fallback to lower-cased name
    const key = ing.ingredientId || ing.ingredientName.toLowerCase().trim();
    const existing = byIngredient.get(key);

    if (existing) {
      if (ing.amountGrams === null) {
        existing.hasUnknownWeight = true;
      } else if (existing.totalRequiredGrams !== null) {
        existing.totalRequiredGrams += ing.amountGrams;
      }
      if (!existing.sourceRecipeIds.includes(ing.recipeId)) {
        existing.sourceRecipeIds.push(ing.recipeId);
      }
    } else {
      byIngredient.set(key, {
        ingredientId: ing.ingredientId,
        ingredientName: ing.ingredientName,
        totalRequiredGrams: ing.amountGrams,
        coveredByPantryGrams: 0,
        sourceRecipeIds: [ing.recipeId],
        hasUnknownWeight: ing.amountGrams === null,
      });
    }
  }

  // Apply pantry subtraction
  for (const [, acc] of byIngredient) {
    if (acc.totalRequiredGrams === null) continue;

    const pantryMatch = findPantryMatch(acc.ingredientName, pantryItems);
    if (!pantryMatch) continue;

    const pantryGrams = pantryMatch.amountGrams ?? 0;
    const covered = Math.min(pantryGrams, acc.totalRequiredGrams);
    acc.coveredByPantryGrams = covered;
  }

  // ── Step 3–6: build output records ────────────────────────────────────────

  const result: GroceryListItemInput[] = [];

  for (const [, acc] of byIngredient) {
    let totalGrams: number | null;
    let remainingToBuyGrams: number | null;
    let fromPantry = false;

    if (acc.hasUnknownWeight || acc.totalRequiredGrams === null) {
      totalGrams = null;
      remainingToBuyGrams = null;
    } else {
      totalGrams = acc.totalRequiredGrams;
      remainingToBuyGrams = Math.max(0, acc.totalRequiredGrams - acc.coveredByPantryGrams);
      fromPantry = remainingToBuyGrams === 0 && acc.coveredByPantryGrams > 0;
    }

    const displayText = toDisplayText(acc.ingredientName, remainingToBuyGrams ?? totalGrams, densities);
    const category = assignAisle(acc.ingredientName);

    result.push({
      weekStartDate,
      ingredientName: acc.ingredientName,
      ingredientId: acc.ingredientId,
      category,
      totalAmount: totalGrams,
      totalUnit: "g",
      totalGrams,
      displayText,
      isChecked: false,
      fromPantry,
      sourceRecipeIds: acc.sourceRecipeIds,
      coveredByPantryGrams: acc.coveredByPantryGrams > 0 ? acc.coveredByPantryGrams : null,
      remainingToBuyGrams,
    });
  }

  // Sort: uncovered items first (fromPantry = false), then by aisle category
  result.sort((a, b) => {
    if (a.fromPantry !== b.fromPantry) return a.fromPantry ? 1 : -1;
    return (a.category ?? "").localeCompare(b.category ?? "");
  });

  return result;
}

// ── Levenshtein export (used by tests) ───────────────────────────────────────
export { similarity as pantryNameSimilarity };
