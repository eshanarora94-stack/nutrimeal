"use client";

import { Badge } from "@/components/ui/badge";

interface Props {
  difficulty?: string | null;
  prepMins: number;
  cookMins: number;
  isFavorite?: boolean;
  nutritionScore?: number | null;
}

export function RecipeBadge({ difficulty, prepMins, cookMins, isFavorite, nutritionScore }: Props) {
  const totalMins = prepMins + cookMins;
  const timeLabel = totalMins < 60 ? `${totalMins}m` : `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`;

  return (
    <div className="flex flex-wrap gap-1.5">
      {isFavorite && <Badge variant="secondary">⭐ Favorite</Badge>}
      {difficulty && (
        <Badge variant="outline" className="capitalize">{difficulty}</Badge>
      )}
      <Badge variant="outline">⏱ {timeLabel}</Badge>
      {nutritionScore != null && (
        <Badge
          variant="outline"
          className={
            nutritionScore >= 80 ? "border-green-300 text-green-700" :
            nutritionScore >= 60 ? "border-yellow-300 text-yellow-700" :
            "border-red-300 text-red-700"
          }
        >
          Score: {Math.round(nutritionScore)}
        </Badge>
      )}
    </div>
  );
}
