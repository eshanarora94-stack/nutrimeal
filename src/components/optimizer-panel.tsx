"use client";

/**
 * OptimizerPanel
 *
 * Shows the top 3 recipe suggestions for the currently-selected meal slot.
 * Fetches from GET /api/optimizer?date=YYYY-MM-DD&mealType=...
 *
 * When the user clicks "Add", it POSTs to /api/meal-plans and calls onAdded()
 * so the parent (planner page) can re-fetch the calendar.
 */

import { useEffect, useState } from "react";
import { Loader2, Flame, Clock, Star, Plus, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MealType } from "./meal-calendar";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScoredRecipe {
  recipeId: string;
  recipeName: string;
  score: number;
  prepMins: number;
  cookMins: number;
  isFavorite: boolean;
  nutritionScore: number | null;
  macros: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
}

interface OptimizerPanelProps {
  selectedSlot: { date: string; mealType: MealType } | null;
  onAdded?: () => void;
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-400" : "bg-rose-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="w-7 text-right text-[10px] font-semibold tabular-nums text-muted-foreground">
        {score}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function OptimizerPanel({ selectedSlot, onAdded }: OptimizerPanelProps) {
  const [suggestions, setSuggestions] = useState<ScoredRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSlot) {
      setSuggestions([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(
      `/api/optimizer?date=${selectedSlot.date}&mealType=${selectedSlot.mealType}`
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Error ${res.status}`);
        }
        return res.json() as Promise<ScoredRecipe[]>;
      })
      .then((data) => {
        if (!cancelled) setSuggestions(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedSlot?.date, selectedSlot?.mealType]);

  const handleAdd = async (recipe: ScoredRecipe) => {
    if (!selectedSlot) return;
    setAdding(recipe.recipeId);
    try {
      const res = await fetch("/api/meal-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeId: recipe.recipeId,
          date: selectedSlot.date,
          mealType: selectedSlot.mealType,
          servings: 1,
        }),
      });
      if (res.ok) {
        onAdded?.();
      }
    } finally {
      setAdding(null);
    }
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!selectedSlot) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <p>Click an empty slot in the calendar to get meal suggestions.</p>
      </div>
    );
  }

  const slotLabel = `${selectedSlot.mealType.charAt(0).toUpperCase() + selectedSlot.mealType.slice(1)} · ${new Date(selectedSlot.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Suggestions for
        </p>
        <p className="text-sm font-semibold text-foreground">{slotLabel}</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Finding best matches…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && suggestions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No recipes found. Add some recipes first.
        </p>
      )}

      {!loading && !error && suggestions.map((recipe, idx) => (
        <div
          key={recipe.recipeId}
          className="rounded-lg border border-border bg-card p-3 shadow-sm"
        >
          {/* Header */}
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-muted-foreground">
                  #{idx + 1}
                </span>
                {recipe.isFavorite && (
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                )}
                <p className="truncate text-sm font-semibold">{recipe.recipeName}</p>
              </div>
            </div>
            <button
              onClick={() => handleAdd(recipe)}
              disabled={adding === recipe.recipeId}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
              )}
            >
              {adding === recipe.recipeId ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plus className="size-3" />
              )}
              Add
            </button>
          </div>

          {/* Score bar */}
          <ScoreBar score={recipe.score} />

          {/* Meta */}
          <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Flame className="size-3" />
              {Math.round(recipe.macros.calories)} kcal
            </span>
            <span className="flex items-center gap-0.5">
              <Clock className="size-3" />
              {recipe.prepMins + recipe.cookMins}m
            </span>
            <span>P {Math.round(recipe.macros.proteinG)}g</span>
            <span>C {Math.round(recipe.macros.carbsG)}g</span>
            <span>F {Math.round(recipe.macros.fatG)}g</span>
          </div>
        </div>
      ))}
    </div>
  );
}
