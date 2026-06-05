"use client";

import { Badge } from "@/components/ui/badge";
import type { NutrientGap } from "@/lib/nutrition";

interface Props {
  deficiencies: NutrientGap[];
  excesses: NutrientGap[];
  maxDeficiencies?: number;
  maxExcesses?: number;
}

const SEVERITY_COLORS = {
  severe: "bg-red-100 text-red-800 border-red-200",
  moderate: "bg-orange-100 text-orange-800 border-orange-200",
  low: "bg-yellow-100 text-yellow-800 border-yellow-200",
};

export function DeficiencyAlerts({
  deficiencies,
  excesses,
  maxDeficiencies = 3,
  maxExcesses = 2,
}: Props) {
  const topDefs = [...deficiencies]
    .sort((a, b) => {
      const order = { severe: 0, moderate: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    })
    .slice(0, maxDeficiencies);

  const topExc = excesses.slice(0, maxExcesses);

  if (topDefs.length === 0 && topExc.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">All nutrients on track today.</p>
    );
  }

  return (
    <div className="space-y-3">
      {topDefs.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Deficiencies
          </p>
          <div className="flex flex-wrap gap-2">
            {topDefs.map((gap) => (
              <Badge
                key={gap.nutrientId}
                variant="outline"
                className={`${SEVERITY_COLORS[gap.severity]} capitalize`}
              >
                {gap.nutrientName} — {Math.round(gap.percentOfTarget)}%
              </Badge>
            ))}
          </div>
        </div>
      )}
      {topExc.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Exceeds limit
          </p>
          <div className="flex flex-wrap gap-2">
            {topExc.map((exc) => (
              <Badge key={exc.nutrientId} variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                {exc.nutrientName} — {Math.round(exc.percentOfTarget)}%
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
