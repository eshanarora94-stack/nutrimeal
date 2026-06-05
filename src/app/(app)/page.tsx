import Link from "next/link";
import { prisma } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  calculateDailyNutritionScore,
  calculateWeeklyNutritionAnalysis,
  type DayNutrition,
  type NutrientTotal,
  type MacroTotals,
} from "@/lib/nutrition";
import { NutritionPanel } from "@/components/nutrition-panel";
import { WeeklySparklines } from "@/components/weekly-sparklines";

export const dynamic = "force-dynamic";

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function DashboardPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const weekStart = getWeekStart(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [todayPlans, recipeCount, goals, references, weekPlans] = await Promise.all([
    prisma.mealPlan.findMany({
      where: { date: { gte: today, lt: tomorrow } },
      include: { recipe: true, snapshot: true },
      orderBy: { mealType: "asc" },
    }),
    prisma.recipe.count(),
    prisma.nutritionGoal.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.nutrientReference.findMany(),
    prisma.mealPlan.findMany({
      where: { date: { gte: weekStart, lt: weekEnd } },
      include: { snapshot: true },
    }),
  ]);

  const mealTypes = ["breakfast", "lunch", "dinner", "snack"];
  const plansByType = Object.fromEntries(
    mealTypes.map((t) => [t, todayPlans.filter((p) => p.mealType === t)])
  );

  let dailyScore = null;
  let dayMacros: MacroTotals | null = null;

  if (goals && todayPlans.some((p) => p.snapshot)) {
    const allNutrients: NutrientTotal[][] = todayPlans
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

    dayMacros = {
      calories: todayPlans.reduce((s, mp) => s + ((mp.snapshot?.calories ?? 0) * mp.servings), 0),
      proteinG: todayPlans.reduce((s, mp) => s + ((mp.snapshot?.proteinG ?? 0) * mp.servings), 0),
      carbsG: todayPlans.reduce((s, mp) => s + ((mp.snapshot?.carbsG ?? 0) * mp.servings), 0),
      fatG: todayPlans.reduce((s, mp) => s + ((mp.snapshot?.fatG ?? 0) * mp.servings), 0),
      fiberG: todayPlans.reduce((s, mp) => s + ((mp.snapshot?.fiberG ?? 0) * mp.servings), 0),
    };

    const dayNutrition: DayNutrition = {
      date: today.toISOString().split("T")[0],
      nutrients: merged,
      macros: dayMacros,
    };

    dailyScore = calculateDailyNutritionScore(dayNutrition, goals, references);
  }

  const weeklyAnalysis =
    goals && weekPlans.length > 0
      ? calculateWeeklyNutritionAnalysis(weekPlans, goals, references)
      : null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            {today.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <p className="text-sm text-muted-foreground italic hidden sm:block">
          Planning guide - not medical advice.
        </p>
      </div>

      {!goals && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-4">
            <p className="text-sm text-amber-800">
              No nutrition goals set.{" "}
              <Link href="/settings" className="font-medium underline">
                Set your goals
              </Link>
            </p>
          </CardContent>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Today</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {mealTypes.map((type) => {
            const plans = plansByType[type] ?? [];
            return (
              <Card key={type}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm capitalize text-muted-foreground">
                    {type}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {plans.length > 0 ? (
                    plans.map((p) => (
                      <div key={p.id} className="text-sm">
                        <p className="font-medium truncate">{p.recipe.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.servings} serving{p.servings !== 1 ? "s" : ""}
                          {p.snapshot?.calories
                            ? ` - ${Math.round(p.snapshot.calories * p.servings)} kcal`
                            : ""}
                        </p>
                      </div>
                    ))
                  ) : (
                    <Link
                      href="/planner"
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "w-full justify-start text-muted-foreground"
                      )}
                    >
                      + Add meal
                    </Link>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {goals && dailyScore && dayMacros ? (
          <div className="space-y-2">
            <NutritionPanel
              score={dailyScore}
              goals={{
                calories: goals.calories,
                proteinG: goals.proteinG,
                carbsG: goals.carbsG,
                fatG: goals.fatG,
              }}
              macros={dayMacros}
            />
            {dailyScore.deficiencies.length > 0 && (
              <div className="flex justify-end">
                <Link
                  href="/planner"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Fix deficiencies
                </Link>
              </div>
            )}
          </div>
        ) : goals && todayPlans.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No meals planned today. Add meals above to see your nutrition score.
            </CardContent>
          </Card>
        ) : goals ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Nutrition score will appear once meals have ingredient data.
            </CardContent>
          </Card>
        ) : null}
      </section>

      {goals && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">This Week</h2>
          <Card>
            <CardContent className="pt-6">
              <WeeklySparklines
                analysis={
                  weeklyAnalysis ?? {
                    averageCalories: 0,
                    averageMacros: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
                    averageMicronutrients: [],
                    recurringDeficiencies: [],
                    recurringExcesses: [],
                    bestDay: null,
                    worstDay: null,
                    weeklyScore: 0,
                    planCompletion: 0,
                  }
                }
                calorieTarget={goals.calories}
                macroTargets={{
                  proteinG: goals.proteinG,
                  carbsG: goals.carbsG,
                  fatG: goals.fatG,
                }}
                weekStart={weekStart}
              />
            </CardContent>
          </Card>

          {weeklyAnalysis && weeklyAnalysis.recurringDeficiencies.length > 0 && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="py-4">
                <p className="text-sm font-medium text-orange-800 mb-2">Recurring this week:</p>
                <div className="flex flex-wrap gap-2">
                  {weeklyAnalysis.recurringDeficiencies.map((gap) => (
                    <span
                      key={gap.nutrientId}
                      className="text-xs bg-orange-100 text-orange-800 border border-orange-200 rounded px-2 py-0.5"
                    >
                      {gap.nutrientName} low 3+ days
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      <section>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recipes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{recipeCount}</p>
              <Link
                href="/recipes"
                className={cn(buttonVariants({ variant: "link", size: "sm" }), "px-0")}
              >
                View all
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{"Today's Meals"}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{todayPlans.length}</p>
              <p className="text-xs text-muted-foreground">of 4 meal slots</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              <Link
                href="/recipes/new"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                + Add Recipe
              </Link>
              <Link
                href="/planner"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Plan Meals
              </Link>
              <Link
                href="/recipes/discover"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Import Recipe
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
