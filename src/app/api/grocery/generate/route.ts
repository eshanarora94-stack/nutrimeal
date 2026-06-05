/**
 * POST /api/grocery/generate?weekStart=YYYY-MM-DD
 *   Regenerates the grocery list for the given week:
 *   1. Deletes existing GroceryListItems for that weekStart
 *   2. Fetches meal plans + ingredients + pantry + densities
 *   3. Calls generateGroceryList()
 *   4. Writes new GroceryListItem records
 *   Returns the created items.
 *
 * GET /api/grocery/generate?weekStart=YYYY-MM-DD
 *   Returns existing GroceryListItems for the week (or empty []).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateGroceryList, type GroceryIngredient } from "@/lib/grocery";
import { Prisma } from "@prisma/client";

function parseWeekStart(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  const weekStart = parseWeekStart(req.nextUrl.searchParams.get("weekStart"));
  if (!weekStart) {
    return NextResponse.json({ error: "weekStart=YYYY-MM-DD required" }, { status: 400 });
  }

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const items = await prisma.groceryListItem.findMany({
    where: { weekStartDate: { gte: weekStart, lt: weekEnd } },
    orderBy: [{ fromPantry: "asc" }, { category: "asc" }, { ingredientName: "asc" }],
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const weekStart = parseWeekStart(req.nextUrl.searchParams.get("weekStart"));
  if (!weekStart) {
    return NextResponse.json({ error: "weekStart=YYYY-MM-DD required" }, { status: 400 });
  }

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // ── Fetch all data in parallel ───────────────────────────────────────────
  const [mealPlans, pantryItems, densities] = await Promise.all([
    prisma.mealPlan.findMany({
      where: { date: { gte: weekStart, lt: weekEnd } },
      include: {
        recipe: {
          include: { ingredients: { include: { ingredient: true } } },
        },
      },
    }),
    prisma.pantryItem.findMany(),
    prisma.ingredientDensity.findMany(),
  ]);

  // ── Build scaled ingredient list ─────────────────────────────────────────
  const allIngredients: GroceryIngredient[] = [];

  for (const plan of mealPlans) {
    for (const ri of plan.recipe.ingredients) {
      allIngredients.push({
        ingredientId: ri.ingredientId,
        ingredientName: ri.ingredient?.name ?? ri.ingredientId,
        amountGrams: ri.amountGrams != null ? ri.amountGrams * plan.servings : null,
        recipeId: plan.recipeId,
      });
    }
  }

  // ── Run pipeline ─────────────────────────────────────────────────────────
  const generated = generateGroceryList(weekStart, allIngredients, pantryItems, densities);

  // ── Delete existing list for the week, write new ─────────────────────────
  const items = await prisma.$transaction(async (tx) => {
    await tx.groceryListItem.deleteMany({
      where: { weekStartDate: { gte: weekStart, lt: weekEnd } },
    });

    return tx.groceryListItem.createManyAndReturn({
      data: generated.map((g) => ({
        weekStartDate: g.weekStartDate,
        ingredientName: g.ingredientName,
        ingredientId: g.ingredientId,
        category: g.category,
        totalAmount: g.totalAmount,
        totalUnit: g.totalUnit,
        totalGrams: g.totalGrams,
        displayText: g.displayText,
        isChecked: false,
        fromPantry: g.fromPantry,
        sourceRecipeIds: g.sourceRecipeIds as Prisma.InputJsonValue,
        coveredByPantryGrams: g.coveredByPantryGrams,
        remainingToBuyGrams: g.remainingToBuyGrams,
      })),
    });
  });

  return NextResponse.json(items, { status: 201 });
}
