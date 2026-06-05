/**
 * lib/themealdb.ts
 *
 * TheMealDB API client. API key "1" (free, no signup).
 * Returns no nutrition data, no prep/cook times, no serving count.
 * All of those are collected in the import wizard.
 */

const BASE = "https://www.themealdb.com/api/json/v1/1";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MealDBMeal {
  idMeal: string;
  strMeal: string;
  strCategory: string | null;
  strArea: string | null;
  strInstructions: string;
  strMealThumb: string | null;
  strTags: string | null;
  strYoutube: string | null;
  strSource: string | null;
  // Ingredients / measures: strIngredient1..20, strMeasure1..20
  [key: string]: string | null;
}

export interface MealDBCategory {
  idCategory: string;
  strCategory: string;
  strCategoryThumb: string;
  strCategoryDescription: string;
}

export interface ParsedIngredient {
  ingredient: string;  // strIngredient (trimmed, lower-case)
  measure: string;     // strMeasure as-is
  displayText: string; // "1 tbs garlic"
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`TheMealDB ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

/** Extract the 20 ingredient/measure slots from a raw meal object. */
export function parseMealIngredients(meal: MealDBMeal): ParsedIngredient[] {
  const result: ParsedIngredient[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] ?? "").trim();
    const measure = (meal[`strMeasure${i}`] ?? "").trim();
    if (!name) continue;
    result.push({
      ingredient: name.toLowerCase(),
      measure,
      displayText: measure ? `${measure} ${name}` : name,
    });
  }
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Search meals by name. Returns up to ~25 results. */
export async function searchMeals(query: string): Promise<MealDBMeal[]> {
  const data = await get<{ meals: MealDBMeal[] | null }>(`/search.php?s=${encodeURIComponent(query)}`);
  return data.meals ?? [];
}

/** Look up a single meal by ID. Returns null if not found. */
export async function getMealById(id: string): Promise<MealDBMeal | null> {
  const data = await get<{ meals: MealDBMeal[] | null }>(`/lookup.php?i=${id}`);
  return data.meals?.[0] ?? null;
}

/** List all categories. */
export async function getCategories(): Promise<MealDBCategory[]> {
  const data = await get<{ categories: MealDBCategory[] }>(`/categories.php`);
  return data.categories ?? [];
}

/** Filter meals by category. Returns lightweight stubs (id + name + thumb only). */
export async function filterByCategory(category: string): Promise<Pick<MealDBMeal, "idMeal" | "strMeal" | "strMealThumb">[]> {
  const data = await get<{ meals: Pick<MealDBMeal, "idMeal" | "strMeal" | "strMealThumb">[] | null }>(
    `/filter.php?c=${encodeURIComponent(category)}`
  );
  return data.meals ?? [];
}

/** Get a random meal. */
export async function getRandomMeal(): Promise<MealDBMeal | null> {
  const data = await get<{ meals: MealDBMeal[] | null }>(`/random.php`);
  return data.meals?.[0] ?? null;
}
