"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MacroProgressBars } from "./macro-progress-bars";
import { NutritionScoreRing } from "./nutrition-score-ring";
import { DeficiencyAlerts } from "./deficiency-alerts";
import type { NutritionScore } from "@/lib/nutrition";

interface Props {
  score: NutritionScore;
  goals: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  macros: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
}

export function NutritionPanel({ score, goals, macros }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="flex items-center justify-center p-6">
        <NutritionScoreRing score={score.score} />
      </Card>
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Macros</CardTitle>
        </CardHeader>
        <CardContent>
          <MacroProgressBars
            calories={macros.calories} calorieTarget={goals.calories}
            proteinG={macros.proteinG} proteinTarget={goals.proteinG}
            carbsG={macros.carbsG} carbsTarget={goals.carbsG}
            fatG={macros.fatG} fatTarget={goals.fatG}
          />
        </CardContent>
      </Card>
      <Card className="md:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Nutrient Gaps</CardTitle>
        </CardHeader>
        <CardContent>
          <DeficiencyAlerts
            deficiencies={score.deficiencies}
            excesses={score.excesses}
          />
        </CardContent>
      </Card>
    </div>
  );
}
