"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { GroceryList } from "@/components/grocery-list";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

function getMondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
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

export default function GroceryPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOf(new Date()));

  const prevWeek = () =>
    setWeekStart((d) => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; });
  const nextWeek = () =>
    setWeekStart((d) => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; });
  const goToday = () => setWeekStart(getMondayOf(new Date()));

  const isCurrentWeek =
    weekStart.toDateString() === getMondayOf(new Date()).toDateString();

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Grocery List</h1>
          <p className="text-sm text-muted-foreground">{formatWeekRange(weekStart)}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            disabled={isCurrentWeek}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1.5 disabled:opacity-40"
            )}
          >
            <CalendarDays className="size-3.5" />
            This week
          </button>
          <div className="flex items-center rounded-md border border-border">
            <button onClick={prevWeek} className="rounded-l-md p-2 hover:bg-muted" aria-label="Previous week">
              <ChevronLeft className="size-4" />
            </button>
            <button onClick={nextWeek} className="rounded-r-md p-2 hover:bg-muted" aria-label="Next week">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <GroceryList weekStart={weekStart} />
    </div>
  );
}
