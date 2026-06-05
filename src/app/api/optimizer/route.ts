/**
 * GET /api/optimizer?date=YYYY-MM-DD&mealType=breakfast
 *
 * Returns the top 3 scored recipes for the given meal slot.
 * Scores every recipe in the DB against the current day state
 * (what's already planned for that day minus this slot).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateRecipeNutrition } from "@/lib/nutrition";
import { scoreRecipeForSlot, rankRecipes } from "@/lib/optimizer";
import type { MealSlot, DayState, RecipeWithNutrition } from "@/lib/optimizer";
import type { NutrientTotal } from "@/lib/nutrition";

const VALID_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealType = (typeof VALID_MEAL_TYPES)[number];

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const date = searchParams.get("date");
  const mealType = searchParams.get("mealType") as MealType | null;

  if (!date || !mealType) {
    return NextResponse.json(
      { error: "date and mealType query params are required" },
      { status: 400 }
    );
  }

  if (!VALID_MEAL_TYPES.includes(mealType)) {
    return NextResponse.json(
      { error: `mealType must be one of: ${VALID_MEAL_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // ── Fetch goals + references ─────────────────────────────────────────────
  const [goals, references, pantry] = await Promise.all([
    prisma.nutritionGoal.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.nutrientReference.findMany(),
    prisma.pantryItem.findMany(),
  ]);

  if (!goals) {
    return NextResponse.json(
      { error: "No nutrition goals set. Visit /settings to configure goals." },
      { status: 422 }
    );
  }

  // ── Build day state (meals already planned for this date, excl. this slot) ─
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const existingPlans = await prisma.mealPlan.findMany({
    where: {
      date: { gte: startOfDay, lte: endOfDay },
      mealType: { not: mealType },
    },
    include: { snapshot: true },
  });

  let dayCalories = 0;
  const dayNutrients: NutrientTotal[] = [];
  const nutrientMap = new Map<string, NutrientTotal>();

  for (const plan of existingPlans) {
    if (!plan.snapshot) continue;
    dayCalories += (plan.snapshot.calories ?? 0) * plan.servings;

    const raw = plan.snapshot.fullNutrients;
    if (Array.isArray(raw)) {
      for (const n of raw as unknown as NutrientTotal[]) {
        const scaled = { ...n, amount: n.amount * plan.servings };
        const existing = nutrientMap.get(n.nutrientId);
        if (existing) {
          nutrientMap.set(n.nutrientId, { ...existing, amount: existing.amount + scaled.amount });
        } else {
          nutrientMap.set(n.nutrientId, scaled);
        }
      }
    }
  }
  dayNutrients.push(...nutrientMap.values());

  const dayState: DayState = { calories: dayCalories, nutrients: dayNutrients };
  const slot: MealSlot = { date, mealType };

  // ── Fetch all recipes ────────────────────────────────────────────────────
  const recipes = await prisma.recipe.findMany({
    include: { ingredients: { include: { ingredient: true } } },
  });

  // ── Score each recipe ────────────────────────────────────────────────────
  const scored: Array<{ recipe: RecipeWithNutrition; score: number }> = [];

  for (const recipe of recipes) {
    const { perServing, macros } = calculateRecipeNutrition(recipe);

    const rWithNutrition: RecipeWithNutrition = {
      id: recipe.id,
      name: recipe.name,
      prepMins: recipe.prepMins,
      cookMins: recipe.cookMins,
      servings: recipe.servings,
      isFavorite: recipe.isFavorite,
      nutritionScore: recipe.nutritionScore,
      lastCookedAt: recipe.lastCookedAt,
      perServing,
      macros,
      ingredientWeightG: recipe.ingredients.reduce(
        (s, i) => s + (i.amountGrams ?? 0),
        0
      ),
      ingredients: recipe.ingredients.map((i) => ({
        ingredientId: i.ingredientId,
        amountGrams: i.amountGrams,
      })),
    };

    const score = scoreRecipeForSlot(rWithNutrition, slot, dayState, goals, references, pantry);
    scored.push({ recipe: rWithNutrition, score });
  }

  // ── Rank and return top 3 ────────────────────────────────────────────────
  const ranked = rankRecipes(scored, pantry).slice(0, 3);

  return NextResponse.json(
    ranked.map(({ recipe, score }) => ({
      recipeId: recipe.id,
      recipeName: recipe.name,
      score: Math.round(score),
      prepMins: recipe.prepMins,
      cookMins: recipe.cookMins,
      isFavorite: recipe.isFavorite,
      nutritionScore: recipe.nutritionScore,
      macros: recipe.macros,
    }))
  );
}
