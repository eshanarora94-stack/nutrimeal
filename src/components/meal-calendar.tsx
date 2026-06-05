"use client";

/**
 * MealCalendar
 *
 * 7-column (Mon–Sun) x 4-row (breakfast / lunch / dinner / snack) drag-and-drop
 * weekly planner. Uses dnd-kit.
 *
 * External contracts:
 *   - Reads meal plans via GET /api/meal-plans?weekStart=YYYY-MM-DD
 *   - Creates via POST /api/meal-plans
 *   - Deletes via DELETE /api/meal-plans/:id
 *   - Calls onSlotSelect(date, mealType) when the user clicks an empty slot
 *     (so the parent can open the optimizer panel).
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  useDraggable,
  closestCenter,
} from "@dnd-kit/core";
import { X, Clock, Flame, GripVertical, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

interface SnapshotData {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

interface MealPlanEntry {
  id: string;
  date: string; // YYYY-MM-DD
  mealType: MealType;
  servings: number;
  recipe: {
    id: string;
    name: string;
    prepMins: number;
    cookMins: number;
    category: string | null;
  };
  snapshot: SnapshotData | null;
}

interface MealCalendarProps {
  weekStart: Date;
  onSlotSelect?: (date: string, mealType: MealType) => void;
  selectedSlot?: { date: string; mealType: MealType } | null;
  /** Called when a recipe card is dropped into a new slot — parent should call addRecipeToSlot */
  onRecipeDropped?: (recipeId: string, date: string, mealType: MealType, servings: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Draggable meal card ────────────────────────────────────────────────────────

interface MealCardProps {
  entry: MealPlanEntry;
  onRemove: (id: string) => void;
  isDragging?: boolean;
}

function MealCard({ entry, onRemove, isDragging }: MealCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: entry.id,
    data: { entry },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const kcal = entry.snapshot?.calories != null
    ? Math.round(entry.snapshot.calories * entry.servings)
    : null;
  const totalMins = entry.recipe.prepMins + entry.recipe.cookMins;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-start gap-1 rounded-md border border-border bg-card p-1.5 text-xs shadow-sm transition-opacity",
        isDragging && "opacity-30"
      )}
    >
      {/* drag handle */}
      <button
        {...listeners}
        {...attributes}
        className="mt-0.5 shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag"
      >
        <GripVertical className="size-3" />
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-snug">{entry.recipe.name}</p>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          {kcal != null && (
            <span className="flex items-center gap-0.5">
              <Flame className="size-2.5" />
              {kcal} kcal
            </span>
          )}
          {totalMins > 0 && (
            <span className="flex items-center gap-0.5">
              <Clock className="size-2.5" />
              {totalMins}m
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onRemove(entry.id)}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        aria-label="Remove"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

// ── Droppable slot ────────────────────────────────────────────────────────────

interface SlotProps {
  slotId: string;
  date: string;
  mealType: MealType;
  entries: MealPlanEntry[];
  isOver: boolean;
  isSelected: boolean;
  onRemove: (id: string) => void;
  onSelect: () => void;
  activeDragId: string | null;
}

function Slot({ slotId, entries, isOver, isSelected, onRemove, onSelect, activeDragId }: SlotProps) {
  const { setNodeRef } = useDroppable({ id: slotId });

  return (
    <div
      ref={setNodeRef}
      onClick={entries.length === 0 ? onSelect : undefined}
      className={cn(
        "min-h-[4.5rem] rounded-md border border-dashed border-border/60 p-1 transition-colors",
        isOver && "border-primary/60 bg-primary/5",
        isSelected && entries.length === 0 && "border-primary bg-primary/5",
        entries.length === 0 && "cursor-pointer hover:border-primary/40 hover:bg-muted/30"
      )}
    >
      <div className="flex flex-col gap-1">
        {entries.map((e) => (
          <MealCard
            key={e.id}
            entry={e}
            onRemove={onRemove}
            isDragging={e.id === activeDragId}
          />
        ))}
        {entries.length === 0 && (
          <span className="flex h-full items-center justify-center p-2 text-[10px] text-muted-foreground/50">
            + add
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MealCalendar({
  weekStart,
  onSlotSelect,
  selectedSlot,
  onRecipeDropped,
}: MealCalendarProps) {
  const [plans, setPlans] = useState<MealPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekStartIso = isoDate(weekStart);

  // ── Fetch plans ──────────────────────────────────────────────────────────
  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meal-plans?weekStart=${weekStartIso}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      // Normalize dates to YYYY-MM-DD strings
      setPlans(
        (data as Array<MealPlanEntry & { date: string }>).map((p) => ({
          ...p,
          date: p.date.split("T")[0],
        }))
      );
    } catch {
      // silent — leave previous state
    } finally {
      setLoading(false);
    }
  }, [weekStartIso]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // ── Remove plan ──────────────────────────────────────────────────────────
  const handleRemove = useCallback(async (id: string) => {
    setPlans((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/meal-plans/${id}`, { method: "DELETE" });
  }, []);

  // ── dnd-kit sensors ──────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveDragId(active.id as string);
  };

  const handleDragOver = ({ over }: DragOverEvent) => {
    setOverId(over ? (over.id as string) : null);
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveDragId(null);
    setOverId(null);

    if (!over) return;
    const [targetDate, targetMealType] = (over.id as string).split("__") as [string, MealType];

    const draggedEntry = plans.find((p) => p.id === (active.id as string));
    if (!draggedEntry) return;

    // Same slot — no-op
    if (draggedEntry.date === targetDate && draggedEntry.mealType === targetMealType) return;

    // Optimistic update
    setPlans((prev) =>
      prev.map((p) =>
        p.id === draggedEntry.id
          ? { ...p, date: targetDate, mealType: targetMealType }
          : p
      )
    );

    // Delete old + create new
    await fetch(`/api/meal-plans/${draggedEntry.id}`, { method: "DELETE" });
    const res = await fetch("/api/meal-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipeId: draggedEntry.recipe.id,
        date: targetDate,
        mealType: targetMealType,
        servings: draggedEntry.servings,
      }),
    });
    if (res.ok) {
      const newPlan = await res.json();
      setPlans((prev) => [
        ...prev.filter((p) => p.id !== draggedEntry.id),
        { ...newPlan, date: newPlan.date.split("T")[0] },
      ]);
    } else {
      // Revert on failure
      fetchPlans();
    }
  };

  // ── External add (from optimizer panel) ─────────────────────────────────
  // Exposed via imperative handle isn't needed — parent calls fetchPlans after POST.
  // We re-fetch whenever weekStart changes (covered by useEffect above).
  // The parent can trigger a re-fetch by calling the exported `refetch` callback.

  void onRecipeDropped; // future extension hook

  // ── Drag overlay card ────────────────────────────────────────────────────
  const activeEntry = plans.find((p) => p.id === activeDragId);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading plans…
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Header row */}
          <div className="grid grid-cols-[80px_repeat(7,1fr)] gap-1 pb-1">
            <div /> {/* spacer */}
            {weekDays.map((day, i) => {
              const iso = isoDate(day);
              const isToday = iso === isoDate(new Date());
              return (
                <div key={iso} className="text-center">
                  <p className={cn("text-xs font-semibold", isToday ? "text-primary" : "text-muted-foreground")}>
                    {DAY_ABBR[i]}
                  </p>
                  <p className={cn("text-sm font-bold", isToday ? "text-primary" : "text-foreground")}>
                    {day.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Meal rows */}
          {MEAL_TYPES.map((mealType) => (
            <div key={mealType} className="grid grid-cols-[80px_repeat(7,1fr)] gap-1 pb-1">
              {/* Row label */}
              <div className="flex items-start justify-end pr-2 pt-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {MEAL_LABELS[mealType]}
                </span>
              </div>

              {/* Day slots */}
              {weekDays.map((day) => {
                const iso = isoDate(day);
                const slotId = `${iso}__${mealType}`;
                const entries = plans.filter(
                  (p) => p.date === iso && p.mealType === mealType
                );
                const isSelected =
                  selectedSlot?.date === iso &&
                  selectedSlot?.mealType === mealType;

                return (
                  <Slot
                    key={slotId}
                    slotId={slotId}
                    date={iso}
                    mealType={mealType}
                    entries={entries}
                    isOver={overId === slotId}
                    isSelected={isSelected}
                    onRemove={handleRemove}
                    onSelect={() => onSlotSelect?.(iso, mealType)}
                    activeDragId={activeDragId}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeEntry ? (
          <div className="rounded-md border border-primary bg-card p-2 text-xs shadow-xl opacity-90">
            <p className="font-semibold">{activeEntry.recipe.name}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ── Exported helper: add a recipe to a slot and refresh ──────────────────────

export async function addMealPlan(
  recipeId: string,
  date: string,
  mealType: MealType,
  servings = 1
): Promise<boolean> {
  const res = await fetch("/api/meal-plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipeId, date, mealType, servings }),
  });
  return res.ok;
}
