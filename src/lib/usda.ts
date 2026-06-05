/**
 * USDA FoodData Central client.
 *
 * - Base URL: https://api.nal.usda.gov/fdc/v1
 * - Rate limit: 1,000 req/hour (per API key)
 * - Cache: Ingredient rows cached in DB; re-fetched if lastFetched > 30 days ago
 */

const BASE_URL = "https://api.nal.usda.gov/fdc/v1";
const CACHE_TTL_DAYS = 30;

export interface UsdaNutrient {
  nutrientId: string;
  name: string;
  amount: number;
  unitName: string;
  nutrientNumber?: string;
}

export interface UsdaFoodSummary {
  fdcId: number;
  description: string;
  brandOwner?: string;
  foodCategory?: string;
  dataType?: string;
}

export interface UsdaFoodDetail {
  fdcId: number;
  description: string;
  foodCategory?: string | { description: string };
  foodNutrients: Array<{
    nutrient: {
      id: number;
      name: string;
      number: string;
      unitName: string;
    };
    amount?: number;
  }>;
}

export interface UsdaSearchResult {
  foods: UsdaFoodSummary[];
  totalHits: number;
  currentPage: number;
  totalPages: number;
}

function apiKey(): string {
  const key = process.env.USDA_API_KEY;
  if (!key) throw new Error("USDA_API_KEY environment variable is not set");
  return key;
}

/**
 * Search USDA FoodData Central for foods matching the query.
 * dataType filter defaults to "Foundation,SR Legacy" for best nutrient coverage.
 */
export async function searchFoods(
  query: string,
  options: {
    pageSize?: number;
    pageNumber?: number;
    dataType?: string[];
  } = {}
): Promise<UsdaSearchResult> {
  const {
    pageSize = 10,
    pageNumber = 1,
    dataType = ["Foundation", "SR Legacy"],
  } = options;

  const params = new URLSearchParams({
    api_key: apiKey(),
    query,
    pageSize: String(pageSize),
    pageNumber: String(pageNumber),
    dataType: dataType.join(","),
  });

  const res = await fetch(`${BASE_URL}/foods/search?${params}`, {
    next: { revalidate: 3600 }, // Next.js fetch cache: 1hr
  });

  if (!res.ok) {
    throw new Error(
      `USDA search failed: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  return {
    foods: (data.foods ?? []).map((f: Record<string, unknown>) => ({
      fdcId: f.fdcId,
      description: f.description,
      brandOwner: f.brandOwner,
      foodCategory: f.foodCategory,
      dataType: f.dataType,
    })),
    totalHits: data.totalHits ?? 0,
    currentPage: data.currentPage ?? 1,
    totalPages: data.totalPages ?? 1,
  };
}

/**
 * Fetch full nutrient detail for a single food by FDC ID.
 */
export async function getFoodDetail(fdcId: string): Promise<UsdaFoodDetail> {
  const params = new URLSearchParams({ api_key: apiKey() });
  const res = await fetch(`${BASE_URL}/food/${fdcId}?${params}`, {
    next: { revalidate: 86400 }, // 24hr cache
  });

  if (!res.ok) {
    throw new Error(
      `USDA food detail failed for ${fdcId}: ${res.status} ${res.statusText}`
    );
  }

  return res.json();
}

/**
 * Convert a UsdaFoodDetail response into the nutrient array stored in
 * Ingredient.nutrients (per 100g).
 */
export function extractNutrients(detail: UsdaFoodDetail): UsdaNutrient[] {
  return detail.foodNutrients
    .filter((fn) => fn.amount !== undefined && fn.amount !== null)
    .map((fn) => ({
      nutrientId: String(fn.nutrient.id),
      name: fn.nutrient.name,
      amount: fn.amount ?? 0,
      unitName: fn.nutrient.unitName,
      nutrientNumber: fn.nutrient.number,
    }));
}

/**
 * Determine whether a cached Ingredient record needs re-fetching.
 */
export function isCacheStale(lastFetched: Date): boolean {
  const ageMs = Date.now() - lastFetched.getTime();
  return ageMs > CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Extract food category string from a detail response (handles both string
 * and object shapes USDA returns).
 */
export function extractCategory(detail: UsdaFoodDetail): string | null {
  if (!detail.foodCategory) return null;
  if (typeof detail.foodCategory === "string") return detail.foodCategory;
  return detail.foodCategory.description ?? null;
}
