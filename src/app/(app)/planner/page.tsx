"use client";

/**
 * /planner — Weekly meal calendar + optimizer panel.
 *
 * Client component so we can:
 *   - Drive week navigation with local state
 *   - Keep the MealCalendar and OptimizerPanel in sync
 *   - Trigger calendar re-fetches when a recipe is added via the optimizer
 */

import { useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { MealCalendar, type MealType } from "@/components/meal-calendar";
import { OptimizerPanel } from "@/components/optimizer-panel";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMondayOf(d: Date): Date {
  const day = d.getDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${monday.toLocaleDateString(undefined, opts)} – ${sunday.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOf(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<{
    date: string;
    mealType: MealType;
  } | null>(null);
  // Key incremented to force MealCalendar to re-fetch after optimizer adds a meal
  const [calendarKey, setCalendarKey] = useState(0);

  const prevWeek = () =>
    setWeekStart((d) => {
      const next = new Date(d);
      next.setDate(d.getDate() - 7);
      return next;
    });

  const nextWeek = () =>
    setWeekStart((d) => {
      const next = new Date(d);
      next.setDate(d.getDate() + 7);
      return next;
    });

  const goToday = () => {
    setWeekStart(getMondayOf(new Date()));
  };

  const isCurrentWeek =
    weekStart.toDateString() === getMondayOf(new Date()).toDateString();

  const handleSlotSelect = useCallback((date: string, mealType: MealType) => {
    setSelectedSlot((prev) =>
      prev?.date === date && prev?.mealType === mealType ? null : { date, mealType }
    );
  }, []);

  const handleAdded = useCallback(() => {
    // Close the panel and bump the calendar key so it re-fetches
    setSelectedSlot(null);
    setCalendarKey((k) => k + 1);
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Weekly Planner</h1>
          <p className="text-sm text-muted-foreground">{formatWeekRange(weekStart)}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            disabled={isCurrentWeek}
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors",
              "hover:bg-muted disabled:cursor-default disabled:opacity-40"
            )}
          >
            <CalendarDays className="size-4" />
            Today
          </button>

          <div className="flex items-center rounded-md border border-border">
            <button
              onClick={prevWeek}
              className="rounded-l-md p-2 hover:bg-muted"
              aria-label="Previous week"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={nextWeek}
              className="rounded-r-md p-2 hover:bg-muted"
              aria-label="Next week"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main layout: calendar + optimizer ─────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-4 lg:flex-row">
        {/* Calendar */}
        <div className="flex-1 overflow-hidden rounded-xl border border-border bg-background p-3 shadow-sm">
          <MealCalendar
            key={calendarKey}
            weekStart={weekStart}
            selectedSlot={selectedSlot}
            onSlotSelect={handleSlotSelect}
          />
        </div>

        {/* Optimizer panel */}
        <div
          className={cn(
            "shrink-0 rounded-xl border border-border bg-background p-4 shadow-sm transition-all",
            "lg:w-72 xl:w-80"
          )}
        >
          <h2 className="mb-3 text-sm font-semibold text-foreground">Meal Suggestions</h2>
          <OptimizerPanel
            selectedSlot={selectedSlot}
            onAdded={handleAdded}
          />
        </div>
      </div>
    </div>
  );
}
