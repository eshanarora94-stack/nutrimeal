import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateDailyNutritionScore, type DayNutrition, type NutrientTotal, type MacroTotals } from "@/lib/nutrition";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const date = searchParams.get("date"); // ISO date string e.g. 2024-01-15

  if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const [mealPlans, goals, references] = await Promise.all([
    prisma.mealPlan.findMany({
      where: { date: { gte: startOfDay, lte: endOfDay } },
      include: { snapshot: true },
    }),
    prisma.nutritionGoal.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.nutrientReference.findMany(),
  ]);

  if (!goals) return NextResponse.json({ error: "No nutrition goals set" }, { status: 404 });
  if (mealPlans.length === 0) {
    return NextResponse.json({ score: null, message: "No meals planned for this date" });
  }

  // Aggregate snapshots
  const allNutrients: NutrientTotal[][] = mealPlans
    .filter((mp) => mp.snapshot?.fullNutrients)
    .map((mp) => {
      const raw = mp.snapshot!.fullNutrients;
      const nutrients = Array.isArray(raw) ? (raw as unknown as NutrientTotal[]) : [];
      return nutrients.map((n) => ({ ...n, amount: n.amount * mp.servings }));
    });

  const merged = allNutrients.reduce<NutrientTotal[]>((acc, arr) => {
    for (const n of arr) {
      const existing = acc.find((a) => a.nutrientId === n.nutrientId);
      if (existing) existing.amount += n.amount;
      else acc.push({ ...n });
    }
    return acc;
  }, []);

  const macros: MacroTotals = {
    calories: mealPlans.reduce((s, mp) => s + ((mp.snapshot?.calories ?? 0) * mp.servings), 0),
    proteinG: mealPlans.reduce((s, mp) => s + ((mp.snapshot?.proteinG ?? 0) * mp.servings), 0),
    carbsG: mealPlans.reduce((s, mp) => s + ((mp.snapshot?.carbsG ?? 0) * mp.servings), 0),
    fatG: mealPlans.reduce((s, mp) => s + ((mp.snapshot?.fatG ?? 0) * mp.servings), 0),
    fiberG: mealPlans.reduce((s, mp) => s + ((mp.snapshot?.fiberG ?? 0) * mp.servings), 0),
  };

  const dayNutrition: DayNutrition = { date, nutrients: merged, macros };
  const result = calculateDailyNutritionScore(dayNutrition, goals, references);

  return NextResponse.json(result);
}
