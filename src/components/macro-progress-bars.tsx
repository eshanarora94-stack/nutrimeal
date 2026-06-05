"use client";

import { Progress } from "@/components/ui/progress";

interface MacroBar {
  label: string;
  actual: number;
  target: number;
  unit: string;
  color: string;
}

interface Props {
  calories: number;
  calorieTarget: number;
  proteinG: number;
  proteinTarget: number;
  carbsG: number;
  carbsTarget: number;
  fatG: number;
  fatTarget: number;
}

export function MacroProgressBars({
  calories, calorieTarget,
  proteinG, proteinTarget,
  carbsG, carbsTarget,
  fatG, fatTarget,
}: Props) {
  const bars: MacroBar[] = [
    { label: "Calories", actual: calories, target: calorieTarget, unit: "kcal", color: "bg-orange-500" },
    { label: "Protein", actual: proteinG, target: proteinTarget, unit: "g", color: "bg-blue-500" },
    { label: "Carbs", actual: carbsG, target: carbsTarget, unit: "g", color: "bg-yellow-500" },
    { label: "Fat", actual: fatG, target: fatTarget, unit: "g", color: "bg-purple-500" },
  ];

  return (
    <div className="space-y-3">
      {bars.map((bar) => {
        const pct = Math.min((bar.actual / bar.target) * 100, 100);
        const over = bar.actual > bar.target;
        return (
          <div key={bar.label} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{bar.label}</span>
              <span className={over ? "text-red-500" : "text-muted-foreground"}>
                {Math.round(bar.actual)}{bar.unit} / {bar.target}{bar.unit}
                <span className="ml-1 text-xs">({Math.round(pct)}%)</span>
              </span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>
        );
      })}
    </div>
  );
}
