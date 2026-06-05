import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateWeeklyNutritionAnalysis } from "@/lib/nutrition";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const weekStart = searchParams.get("weekStart"); // ISO date string for Monday

  if (!weekStart) return NextResponse.json({ error: "weekStart is required" }, { status: 400 });

  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);

  const [mealPlans, goals, references] = await Promise.all([
    prisma.mealPlan.findMany({
      where: { date: { gte: start, lt: end } },
      include: { snapshot: true },
    }),
    prisma.nutritionGoal.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.nutrientReference.findMany(),
  ]);

  if (!goals) return NextResponse.json({ error: "No nutrition goals set" }, { status: 404 });

  const result = calculateWeeklyNutritionAnalysis(mealPlans, goals, references);
  return NextResponse.json(result);
}
