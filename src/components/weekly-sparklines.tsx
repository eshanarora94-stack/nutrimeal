"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LineChart,
  Line,
} from "recharts";
import type { WeeklyAnalysis } from "@/lib/nutrition";

interface Props {
  analysis: WeeklyAnalysis;
  calorieTarget: number;
  macroTargets: {
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  weekStart: Date;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekDates(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

export function WeeklySparklines({ analysis, calorieTarget, macroTargets, weekStart }: Props) {
  const dates = getWeekDates(weekStart);

  // Build per-day data from averages (we have weeklyScore and averages, not per-day series)
  // The WeeklyAnalysis doesn't expose per-day macro series, so we derive a simple adherence chart
  // from the bestDay/worstDay scores and weekly averages as a 7-point approximation.
  // For the calorie bar chart, we use averageCalories scaled as a flat line (real per-day data
  // would require the planner API, which ships in Phase 5). We render what we have.
  const calorieData = dates.map((date, i) => ({
    day: DAY_LABELS[i],
    date,
    calories: analysis.averageCalories > 0 ? Math.round(analysis.averageCalories) : 0,
    isActual: false, // will be true when Phase 5 provides per-day snapshots
  }));

  // Macro sparkline data (flat weekly averages across 7 days for now)
  const macroData = dates.map((date, i) => ({
    day: DAY_LABELS[i],
    date,
    protein: Math.round(analysis.averageMacros.proteinG),
    carbs: Math.round(analysis.averageMacros.carbsG),
    fat: Math.round(analysis.averageMacros.fatG),
  }));

  const hasData = analysis.planCompletion > 0;

  return (
    <div className="space-y-6">
      {/* Calorie adherence bar chart */}
      <div>
        <p className="text-sm font-medium mb-2">Calorie Adherence (Mon–Sun)</p>
        {hasData ? (
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={calorieData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide domain={[0, Math.max(calorieTarget * 1.3, 100)]} />
              <Tooltip
                formatter={(value) => [`${value} kcal`, "Avg Calories"]}
                labelFormatter={(label) => label}
              />
              <ReferenceLine y={calorieTarget} stroke="#6366f1" strokeDasharray="3 3" strokeWidth={1.5} />
              <Bar dataKey="calories" fill="#818cf8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[120px] flex items-center justify-center text-sm text-muted-foreground bg-muted/30 rounded-md">
            No meals planned this week
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Dashed line = {calorieTarget} kcal target
        </p>
      </div>

      {/* Macro sparklines */}
      {hasData && (
        <div>
          <p className="text-sm font-medium mb-2">Macro Averages (g)</p>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={macroData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                formatter={(value, name) => [
                  `${value}g`,
                  String(name).charAt(0).toUpperCase() + String(name).slice(1),
                ]}
              />
              <Line type="monotone" dataKey="protein" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="carbs" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="fat" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-1">
            <Legend color="#3b82f6" label={`Protein (target ${macroTargets.proteinG}g)`} />
            <Legend color="#f59e0b" label={`Carbs (target ${macroTargets.carbsG}g)`} />
            <Legend color="#ef4444" label={`Fat (target ${macroTargets.fatG}g)`} />
          </div>
        </div>
      )}

      {/* Weekly summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Stat label="Weekly Score" value={hasData ? `${analysis.weeklyScore}/100` : "—"} />
        <Stat label="Avg Calories" value={hasData ? `${Math.round(analysis.averageCalories)} kcal` : "—"} />
        <Stat
          label="Best Day"
          value={analysis.bestDay ? `${DAY_LABELS[new Date(analysis.bestDay.date).getDay() === 0 ? 6 : new Date(analysis.bestDay.date).getDay() - 1]} (${analysis.bestDay.score})` : "—"}
        />
        <Stat
          label="Plan Coverage"
          value={`${Math.round(analysis.planCompletion * 100)}%`}
        />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: color }} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-md p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
