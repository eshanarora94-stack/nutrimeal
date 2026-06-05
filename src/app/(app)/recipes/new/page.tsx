"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IngredientSearch, type IngredientSearchResult } from "@/components/ingredient-search";

interface IngredientRow {
  fdcId: string;
  name: string;
  amount: string;
  unit: string;
}

export default function NewRecipePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [prepMins, setPrepMins] = useState("");
  const [cookMins, setCookMins] = useState("");
  const [servings, setServings] = useState("4");
  const [difficulty, setDifficulty] = useState("");
  const [notes, setNotes] = useState("");
  const [steps, setSteps] = useState<string[]>(["", ""]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);

  const addIngredient = (result: IngredientSearchResult) => {
    setIngredients((prev) => [
      ...prev,
      { fdcId: String(result.fdcId), name: result.description, amount: "1", unit: "cup" },
    ]);
  };

  const removeIngredient = (i: number) =>
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));

  const updateIngredient = (i: number, field: keyof IngredientRow, value: string) =>
    setIngredients((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));

  const addStep = () => setSteps((prev) => [...prev, ""]);
  const updateStep = (i: number, v: string) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? v : s)));
  const removeStep = (i: number) =>
    setSteps((prev) => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name || !prepMins || !cookMins || !servings) {
      setError("Name, prep time, cook time, and servings are required.");
      return;
    }
    setSaving(true);
    setError("");

    // Ensure ingredients exist in DB before saving recipe
    for (const ing of ingredients) {
      await fetch(`/api/foods/${ing.fdcId}`);
    }

    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        source: "custom",
        instructions: JSON.stringify(steps.filter((s) => s.trim())),
        prepMins: parseInt(prepMins),
        cookMins: parseInt(cookMins),
        servings: parseInt(servings),
        category: category || null,
        difficulty: difficulty || null,
        notes: notes || null,
        ingredients: ingredients.map((ing) => ({
          ingredientId: ing.fdcId,
          amount: parseFloat(ing.amount) || 1,
          unit: ing.unit,
        })),
      }),
    });

    setSaving(false);

    if (res.ok) {
      const data = await res.json();
      router.push(`/recipes/${data.id}`);
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to save recipe.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New Recipe</h1>
        <p className="text-muted-foreground">Add a custom recipe with ingredients</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Basic Info</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Recipe Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken Stir Fry" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Category</label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Dinner" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Prep (mins) *</label>
              <Input type="number" value={prepMins} onChange={(e) => setPrepMins(e.target.value)} placeholder="15" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Cook (mins) *</label>
              <Input type="number" value={cookMins} onChange={(e) => setCookMins(e.target.value)} placeholder="30" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Servings *</label>
              <Input type="number" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="4" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Ingredients</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <IngredientSearch onSelect={addIngredient} placeholder="Search USDA foods to add…" />
          {ingredients.length > 0 && (
            <ul className="space-y-2">
              {ingredients.map((ing, i) => (
                <li key={i} className="flex items-center gap-2 rounded-md border p-2">
                  <span className="flex-1 truncate text-sm">{ing.name}</span>
                  <Input
                    type="number"
                    value={ing.amount}
                    onChange={(e) => updateIngredient(i, "amount", e.target.value)}
                    className="w-20"
                    step="0.25"
                    min="0"
                  />
                  <Input
                    value={ing.unit}
                    onChange={(e) => updateIngredient(i, "unit", e.target.value)}
                    className="w-24"
                    placeholder="cup"
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeIngredient(i)} className="text-destructive">✕</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Instructions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                {i + 1}
              </span>
              <Input
                value={step}
                onChange={(e) => updateStep(i, e.target.value)}
                placeholder={`Step ${i + 1}…`}
              />
              {steps.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeStep(i)} className="text-destructive">✕</Button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addStep}>+ Add Step</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Notes (optional)</CardTitle></CardHeader>
        <CardContent>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px]"
            placeholder="Storage tips, variations, substitutions…"
          />
        </CardContent>
      </Card>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pb-8">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Recipe"}
        </Button>
      </div>
    </div>
  );
}
