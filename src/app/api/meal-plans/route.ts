import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateRecipeNutrition } from "@/lib/nutrition";
import { Prisma } from "@prisma/client";

/**
 * GET /api/meal-plans?weekStart=YYYY-MM-DD
 * Returns all meal plans for the 7-day window starting on weekStart.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const weekStart = searchParams.get("weekStart");
  const date = searchParams.get("date");

  if (weekStart) {
    const start = new Date(weekStart);
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 7);

    const plans = await prisma.mealPlan.findMany({
      where: { date: { gte: start, lt: end } },
      include: { recipe: { include: { ingredients: { include: { ingredient: true } } } }, snapshot: true },
      orderBy: [{ date: "asc" }, { mealType: "asc" }],
    });
    return NextResponse.json(plans);
  }

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const plans = await prisma.mealPlan.findMany({
      where: { date: { gte: startOfDay, lte: endOfDay } },
      include: { recipe: { include: { ingredients: { include: { ingredient: true } } } }, snapshot: true },
      orderBy: { mealType: "asc" },
    });
    return NextResponse.json(plans);
  }

  return NextResponse.json({ error: "weekStart or date query param required" }, { status: 400 });
}

/**
 * POST /api/meal-plans
 * Body: { recipeId, date, mealType, servings }
 *
 * Creates a MealPlan and immediately calculates + writes its NutritionSnapshot.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { recipeId, date, mealType, servings } = body;

  if (!recipeId || !date || !mealType || servings == null) {
    return NextResponse.json(
      { error: "recipeId, date, mealType, servings are required" },
      { status: 400 }
    );
  }

  const validMealTypes = ["breakfast", "lunch", "dinner", "snack"];
  if (!validMealTypes.includes(mealType)) {
    return NextResponse.json(
      { error: `mealType must be one of: ${validMealTypes.join(", ")}` },
      { status: 400 }
    );
  }

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: { ingredients: { include: { ingredient: true } } },
  });

  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  // Calculate nutrition for 1 serving of this recipe
  const { macros, perServing } = calculateRecipeNutrition(recipe);

  // Create MealPlan + Snapshot in a transaction
  const mealPlan = await prisma.$transaction(async (tx) => {
    const plan = await tx.mealPlan.create({
      data: {
        recipeId,
        date: new Date(date),
        mealType,
        servings: Number(servings),
      },
    });

    await tx.mealPlanNutritionSnapshot.create({
      data: {
        mealPlanId: plan.id,
        calories: macros.calories,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
        fiberG: macros.fiberG,
        sodiumMg:
          perServing.find(
            (n) =>
              n.nutrientName.toLowerCase().includes("sodium") ||
              n.nutrientId === "307"
          )?.amount ?? null,
        fullNutrients: perServing as unknown as Prisma.InputJsonValue,
      },
    });

    return plan;
  });

  const result = await prisma.mealPlan.findUnique({
    where: { id: mealPlan.id },
    include: { recipe: true, snapshot: true },
  });

  return NextResponse.json(result, { status: 201 });
}
