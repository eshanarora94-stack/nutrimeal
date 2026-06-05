/**
 * GET /api/export
 *
 * Returns a full JSON snapshot of the user's data:
 *   - recipes (with ingredients + source record)
 *   - mealPlans (all, with snapshots)
 *   - pantryItems
 *   - nutritionGoal (latest)
 *   - groceryListItems (current week)
 *
 * Content-Disposition: attachment triggers browser download.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const [recipes, mealPlans, pantryItems, goals, groceryItems] = await Promise.all([
    prisma.recipe.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        ingredients: { include: { ingredient: true } },
        source_record: true,
      },
    }),
    prisma.mealPlan.findMany({
      orderBy: { date: "desc" },
      include: { recipe: true, snapshot: true },
    }),
    prisma.pantryItem.findMany({ orderBy: { name: "asc" } }),
    prisma.nutritionGoal.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.groceryListItem.findMany({
      where: { weekStartDate: { gte: weekStart, lt: weekEnd } },
      orderBy: { category: "asc" },
    }),
  ]);

  const payload = {
    exportedAt: now.toISOString(),
    version: "1.0",
    recipes,
    mealPlans,
    pantryItems,
    nutritionGoal: goals,
    groceryListItems: groceryItems,
  };

  const filename = `nutrimeal-export-${now.toISOString().split("T")[0]}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
