"use client";

/**
 * GroceryList
 *
 * Displays a grocery list grouped by aisle category.
 * - Checkboxes to mark items as bought (PATCH /api/grocery/:id)
 * - fromPantry items shown dimmed with a "In pantry" label
 * - Regenerate button triggers POST /api/grocery/generate?weekStart=...
 * - Items with unknown weight shown with warning indicator
 */

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, ShoppingCart, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GroceryItem {
  id: string;
  ingredientName: string;
  category: string | null;
  displayText: string;
  isChecked: boolean;
  fromPantry: boolean;
  totalGrams: number | null;
  remainingToBuyGrams: number | null;
  coveredByPantryGrams: number | null;
  sourceRecipeIds: string[] | null;
}

// ── Aisle order for display ───────────────────────────────────────────────────

const AISLE_ORDER = [
  "produce",
  "meat",
  "dairy",
  "bakery",
  "pantry",
  "frozen",
  "spices",
  "beverages",
  "other",
];

const AISLE_LABELS: Record<string, string> = {
  produce: "🥦 Produce",
  meat: "🥩 Meat & Seafood",
  dairy: "🥛 Dairy & Eggs",
  bakery: "🍞 Bakery",
  pantry: "🥫 Pantry & Dry Goods",
  frozen: "❄️ Frozen",
  spices: "🌿 Spices & Herbs",
  beverages: "🥤 Beverages",
  other: "📦 Other",
};

// ── Item row ──────────────────────────────────────────────────────────────────

function GroceryRow({
  item,
  onToggle,
}: {
  item: GroceryItem;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    await onToggle(item.id, !item.isChecked);
    setToggling(false);
  };

  const unknownWeight =
    item.totalGrams === null && !item.fromPantry;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-opacity",
        (item.isChecked || item.fromPantry) && "opacity-50"
      )}
    >
      {/* Checkbox */}
      <button
        onClick={handleToggle}
        disabled={toggling || item.fromPantry}
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
          item.isChecked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background",
          item.fromPantry && "cursor-default"
        )}
        aria-label={item.isChecked ? "Uncheck" : "Check"}
      >
        {toggling ? (
          <Loader2 className="size-2.5 animate-spin" />
        ) : item.isChecked ? (
          <Check className="size-2.5" />
        ) : null}
      </button>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "text-sm font-medium",
              (item.isChecked || item.fromPantry) && "line-through"
            )}
          >
            {item.displayText}
          </span>
          {item.fromPantry && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              In pantry
            </span>
          )}
          {unknownWeight && (
            <span
              title="Weight unknown — density data missing"
              className="text-amber-500"
            >
              <AlertCircle className="size-3.5" />
            </span>
          )}
        </div>

        {/* Coverage note */}
        {item.coveredByPantryGrams != null && !item.fromPantry && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {Math.round(item.coveredByPantryGrams)}g covered by pantry
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface GroceryListProps {
  weekStart: Date;
}

export function GroceryList({ weekStart }: GroceryListProps) {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const weekStartIso = weekStart.toISOString().split("T")[0];

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/grocery/generate?weekStart=${weekStartIso}`);
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, [weekStartIso]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleRegenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(
        `/api/grocery/generate?weekStart=${weekStartIso}`,
        { method: "POST" }
      );
      if (res.ok) setItems(await res.json());
    } finally {
      setGenerating(false);
    }
  };

  const handleToggle = useCallback(async (id: string, checked: boolean) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isChecked: checked } : i))
    );
    await fetch(`/api/grocery/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isChecked: checked }),
    });
  }, []);

  // Group by aisle
  const grouped = new Map<string, GroceryItem[]>();
  for (const item of items) {
    const cat = item.category ?? "other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  const sortedCategories = [...grouped.keys()].sort(
    (a, b) =>
      (AISLE_ORDER.indexOf(a) === -1 ? 999 : AISLE_ORDER.indexOf(a)) -
      (AISLE_ORDER.indexOf(b) === -1 ? 999 : AISLE_ORDER.indexOf(b))
  );

  const checkedCount = items.filter((i) => i.isChecked).length;
  const totalToBuy = items.filter((i) => !i.fromPantry).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          {items.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {checkedCount} / {totalToBuy} items checked
            </p>
          )}
        </div>
        <button
          onClick={handleRegenerate}
          disabled={generating}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-1.5"
          )}
        >
          {generating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Regenerate
        </button>
      </div>

      {/* States */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading grocery list…
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
          <ShoppingCart className="size-10 text-muted-foreground/30" />
          <div>
            <p className="text-sm font-medium text-foreground">No grocery list yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Plan meals for the week, then click Regenerate.
            </p>
          </div>
          <button
            onClick={handleRegenerate}
            disabled={generating}
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
          >
            {generating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Generate List
          </button>
        </div>
      )}

      {/* Grouped items */}
      {!loading &&
        sortedCategories.map((cat) => {
          const catItems = grouped.get(cat)!;
          return (
            <div key={cat}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {AISLE_LABELS[cat] ?? cat}
              </h3>
              <div className="flex flex-col gap-1">
                {catItems.map((item) => (
                  <GroceryRow key={item.id} item={item} onToggle={handleToggle} />
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
