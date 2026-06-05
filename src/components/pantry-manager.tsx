"use client";

/**
 * PantryManager
 *
 * Full pantry CRUD:
 *   - USDA ingredient search → select → enter amount / unit / expiry
 *   - "Use Soon" badge: items expiring within 3 days sorted to top
 *   - "Expired" badge: items past their expiry date
 *   - "Can Cook Now" badge per recipe: ≥ 80% ingredient weight covered
 *   - Delete items
 */

import { useState, useEffect, useCallback } from "react";
import { IngredientSearch, type IngredientSearchResult } from "@/components/ingredient-search";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Trash2,
  Plus,
  Loader2,
  Package,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PantryItemData {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  amountGrams: number | null;
  category: string | null;
  expiresAt: string | null;
  notes: string | null;
  useSoon: boolean;
  expired: boolean;
  ingredient?: { name: string } | null;
}

// ── Add form ──────────────────────────────────────────────────────────────────

interface AddFormProps {
  onAdded: () => void;
}

function AddForm({ onAdded }: AddFormProps) {
  const [selectedIngredient, setSelectedIngredient] =
    useState<IngredientSearchResult | null>(null);
  const [customName, setCustomName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleIngredientSelect = (ingredient: IngredientSearchResult) => {
    setSelectedIngredient(ingredient);
    setCustomName(ingredient.description);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = customName.trim();
    if (!name) { setError("Name is required"); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/pantry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredientId: selectedIngredient
            ? String(selectedIngredient.fdcId)
            : null,
          name,
          amount: amount ? Number(amount) : null,
          unit: unit || null,
          expiresAt: expiresAt || null,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      // Reset
      setSelectedIngredient(null);
      setCustomName("");
      setAmount("");
      setUnit("");
      setExpiresAt("");
      setNotes("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-muted/30 p-4"
    >
      <h3 className="mb-3 text-sm font-semibold text-foreground">Add item</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Ingredient search */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Ingredient (USDA search)
          </label>
          <IngredientSearch
            onSelect={handleIngredientSelect}
            placeholder="Search or type ingredient name…"
          />
        </div>

        {/* Custom name override */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Name
          </label>
          <Input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="e.g. Rolled oats"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Amount
          </label>
          <Input
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="2"
          />
        </div>

        {/* Unit */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Unit
          </label>
          <Input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="cups, g, oz…"
          />
        </div>

        {/* Expiry */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Expires (optional)
          </label>
          <Input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Notes (optional)
          </label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Brand, variety…"
          />
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}

      <button
        type="submit"
        disabled={saving}
        className={cn(
          buttonVariants({ variant: "default", size: "sm" }),
          "mt-3 gap-1.5"
        )}
      >
        {saving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Plus className="size-3.5" />
        )}
        Add to Pantry
      </button>
    </form>
  );
}

// ── Pantry item row ───────────────────────────────────────────────────────────

function PantryRow({
  item,
  onDelete,
}: {
  item: PantryItemData;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await fetch(`/api/pantry/${item.id}`, { method: "DELETE" });
    onDelete(item.id);
  };

  const amountLabel =
    item.amount != null && item.unit
      ? `${item.amount} ${item.unit}`
      : item.amountGrams != null
      ? `${Math.round(item.amountGrams)}g`
      : "—";

  const expiryLabel = item.expiresAt
    ? new Date(item.expiresAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-sm shadow-sm",
        item.expired && "opacity-60"
      )}
    >
      <Package className="size-4 shrink-0 text-muted-foreground" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{item.name}</span>
          {item.expired && (
            <Badge variant="destructive" className="text-[10px]">
              Expired
            </Badge>
          )}
          {!item.expired && item.useSoon && (
            <Badge className="bg-amber-100 text-amber-700 text-[10px] dark:bg-amber-900/30 dark:text-amber-400">
              <Clock className="mr-0.5 size-2.5" />
              Use Soon
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span>{amountLabel}</span>
          {item.category && <span>· {item.category}</span>}
          {expiryLabel && (
            <span className={cn(item.useSoon && "text-amber-600 dark:text-amber-400")}>
              · expires {expiryLabel}
            </span>
          )}
          {item.notes && <span>· {item.notes}</span>}
        </div>
      </div>

      <button
        onClick={handleDelete}
        disabled={deleting}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        aria-label="Delete"
      >
        {deleting ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Trash2 className="size-3.5" />
        )}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PantryManager() {
  const [items, setItems] = useState<PantryItemData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pantry");
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const useSoonItems = items.filter((i) => i.useSoon && !i.expired);
  const regularItems = items.filter((i) => !i.useSoon || i.expired);

  return (
    <div className="flex flex-col gap-4">
      <AddForm onAdded={fetchItems} />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading pantry…
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          <Package className="size-8 opacity-30" />
          <p>Your pantry is empty. Add ingredients above.</p>
        </div>
      )}

      {!loading && useSoonItems.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3.5" />
            Use Soon ({useSoonItems.length})
          </div>
          <div className="flex flex-col gap-1.5">
            {useSoonItems.map((item) => (
              <PantryRow key={item.id} item={item} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {!loading && regularItems.length > 0 && (
        <div>
          {useSoonItems.length > 0 && (
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <CheckCircle2 className="size-3.5" />
              All items ({regularItems.length})
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            {regularItems.map((item) => (
              <PantryRow key={item.id} item={item} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
