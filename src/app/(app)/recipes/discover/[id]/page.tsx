"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IngredientSearch, type IngredientSearchResult } from "@/components/ingredient-search";
import { cn } from "@/lib/utils";
import { parseMealIngredients, type MealDBMeal, type ParsedIngredient } from "@/lib/themealdb";

// ── Types ─────────────────────────────────────────────────────────────────────

interface IngredientMatch {
  parsed: ParsedIngredient;
  matched: IngredientSearchResult | null;
  confirmed: boolean;
  ambiguous: boolean; // unit flagged as ambiguous (e.g. "bunch", "handful")
}

const AMBIGUOUS_UNITS = ["bunch", "handful", "pinch", "some", "dash", "splash", "piece", "slice", "sprig", "head", "knob", "can", "jar", "packet", "bag", "tin"];

function isAmbiguousUnit(measure: string): boolean {
  const lower = measure.toLowerCase();
  return AMBIGUOUS_UNITS.some((u) => lower.includes(u));
}

type DuplicateAction = "open" | "replace" | "duplicate" | null;

// ── Wizard ────────────────────────────────────────────────────────────────────

export default function ImportWizardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [meal, setMeal] = useState<MealDBMeal | null>(null);
  const [loadingMeal, setLoadingMeal] = useState(true);
  const [mealError, setMealError] = useState<string | null>(null);

  // Step 2 state
  const [matches, setMatches] = useState<IngredientMatch[]>([]);

  // Step 3 state
  const [prepMins, setPrepMins] = useState("");
  const [cookMins, setCookMins] = useState("");
  const [servings, setServings] = useState("");

  // Step 4 / duplicate state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>(null);

  // Load meal from TheMealDB
  useEffect(() => {
    fetch(`/api/meals/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Meal not found");
        return r.json();
      })
      .then((data: MealDBMeal) => {
        setMeal(data);
        const parsed = parseMealIngredients(data);
        setMatches(
          parsed.map((p) => ({
            parsed: p,
            matched: null,
            confirmed: false,
            ambiguous: isAmbiguousUnit(p.measure),
          }))
        );
      })
      .catch((err) => setMealError(err.message))
      .finally(() => setLoadingMeal(false));
  }, [id]);

  // ── Auto-suggest USDA matches on step 2 entry ──────────────────────────────
  useEffect(() => {
    if (step !== 2 || !meal) return;
    matches.forEach((m, i) => {
      if (m.matched) return; // already matched
      fetch(`/api/foods/search?q=${encodeURIComponent(m.parsed.ingredient)}&pageSize=1`)
        .then((r) => r.json())
        .then((data) => {
          const top = data.foods?.[0] ?? null;
          if (!top) return;
          setMatches((prev) =>
            prev.map((match, idx) =>
              idx === i ? { ...match, matched: top } : match
            )
          );
        })
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function confirmMatch(i: number) {
    setMatches((prev) =>
      prev.map((m, idx) => (idx === i ? { ...m, confirmed: true } : m))
    );
  }

  function setMatchResult(i: number, result: IngredientSearchResult) {
    setMatches((prev) =>
      prev.map((m, idx) =>
        idx === i ? { ...m, matched: result, confirmed: false } : m
      )
    );
  }

  function clearMatch(i: number) {
    setMatches((prev) =>
      prev.map((m, idx) =>
        idx === i ? { ...m, matched: null, confirmed: false } : m
      )
    );
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave(forceAction?: DuplicateAction) {
    if (!meal) return;
    setSaving(true);
    setSaveError(null);

    const confirmedIngredients = matches
      .filter((m) => m.confirmed && m.matched)
      .map((m) => ({
        ingredientId: String(m.matched!.fdcId),
        amount: 1,
        unit: m.parsed.measure || "unit",
        displayText: m.parsed.displayText,
      }));

    const instructions = meal.strInstructions
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      name: meal.strMeal,
      source: "theMealDB",
      instructions: JSON.stringify(instructions),
      prepMins: Number(prepMins) || 0,
      cookMins: Number(cookMins) || 0,
      servings: Number(servings) || 2,
      category: meal.strCategory ?? undefined,
      imageUrl: meal.strMealThumb ?? undefined,
      tags: meal.strTags ? meal.strTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      ingredients: confirmedIngredients,
      // RecipeSource metadata
      provider: "themealdb",
      externalId: meal.idMeal,
      sourceUrl: meal.strSource ?? undefined,
      duplicateAction: forceAction ?? null,
    };

    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
        const data = await res.json();
        setDuplicate({ id: data.existingId, name: data.existingName });
        setSaving(false);
        return;
      }

      if (!res.ok) throw new Error(await res.text());

      const created = await res.json();
      router.push(`/recipes/${created.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save recipe.");
      setSaving(false);
    }
  }

  async function handleDuplicateAction(action: DuplicateAction) {
    if (!meal || !duplicate) return;
    setDuplicateAction(action);
    if (action === "open") {
      router.push(`/recipes/${duplicate.id}`);
      return;
    }
    await handleSave(action);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loadingMeal) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Loading recipe...
      </div>
    );
  }

  if (mealError || !meal) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{mealError ?? "Recipe not found."}</p>
        <Link href="/recipes/discover" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to Discover
        </Link>
      </div>
    );
  }

  const parsedIngredients = parseMealIngredients(meal);
  const confirmedCount = matches.filter((m) => m.confirmed).length;
  const allStepsValid =
    prepMins !== "" &&
    cookMins !== "" &&
    servings !== "" &&
    Number(servings) >= 1;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header + step indicator */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Import Recipe</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{meal.strMeal}</p>
        </div>
        <StepIndicator current={step} />
      </div>

      {/* ── Step 1: View ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0 overflow-hidden rounded-lg">
              {meal.strMealThumb && (
                <div className="relative aspect-video w-full">
                  <Image
                    src={meal.strMealThumb}
                    alt={meal.strMeal}
                    fill
                    className="object-cover"
                    sizes="672px"
                  />
                </div>
              )}
              <div className="p-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {meal.strCategory && <Badge variant="secondary">{meal.strCategory}</Badge>}
                  {meal.strArea && <Badge variant="outline">{meal.strArea}</Badge>}
                  {meal.strTags &&
                    meal.strTags.split(",").filter(Boolean).map((t) => (
                      <Badge key={t} variant="outline">{t.trim()}</Badge>
                    ))}
                </div>

                <div>
                  <p className="text-sm font-semibold mb-1">Ingredients ({parsedIngredients.length})</p>
                  <ul className="text-sm text-muted-foreground space-y-0.5 columns-2">
                    {parsedIngredients.map((ing, i) => (
                      <li key={i} className="truncate">{ing.displayText}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-sm font-semibold mb-1">Instructions</p>
                  <div className="text-sm text-muted-foreground whitespace-pre-line line-clamp-6">
                    {meal.strInstructions}
                  </div>
                </div>

                {meal.strYoutube && (
                  <a
                    href={meal.strYoutube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Watch on YouTube
                  </a>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => setStep(2)}>Match Ingredients</Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Match USDA ingredients ───────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Confirm the USDA match for each ingredient. Auto-suggestions require your confirmation before saving.
          </p>

          <div className="space-y-3">
            {matches.map((m, i) => (
              <Card key={i} className={cn(
                "border",
                m.confirmed ? "border-green-300 bg-green-50" : m.ambiguous ? "border-amber-200 bg-amber-50" : ""
              )}>
                <CardContent className="py-3 px-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{m.parsed.displayText}</p>
                    <div className="flex items-center gap-1.5">
                      {m.ambiguous && (
                        <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">
                          Ambiguous unit
                        </Badge>
                      )}
                      {m.confirmed && (
                        <Badge className="text-xs bg-green-600">Confirmed</Badge>
                      )}
                    </div>
                  </div>

                  {!m.confirmed && (
                    <div className="space-y-1.5">
                      {m.matched ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 text-sm bg-muted rounded px-2 py-1 truncate">
                            {m.matched.description}
                            {m.matched.foodCategory && (
                              <span className="text-muted-foreground ml-1.5 text-xs">({m.matched.foodCategory})</span>
                            )}
                          </div>
                          <Button size="sm" variant="outline" onClick={() => clearMatch(i)}>
                            Change
                          </Button>
                          <Button size="sm" onClick={() => confirmMatch(i)}>
                            Confirm
                          </Button>
                        </div>
                      ) : (
                        <IngredientSearch
                          placeholder={`Search USDA for "${m.parsed.ingredient}"...`}
                          onSelect={(result) => setMatchResult(i, result)}
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        Skip to leave this ingredient without nutrition data.
                      </p>
                    </div>
                  )}

                  {m.confirmed && m.matched && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-green-800 truncate">{m.matched.description}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => setMatches((prev) => prev.map((x, idx) => idx === i ? { ...x, confirmed: false } : x))}
                      >
                        Edit
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">
            {confirmedCount} of {matches.length} ingredients confirmed.
          </p>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)}>
              {confirmedCount === 0 ? "Skip matching" : "Next: Add Details"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Time + servings ───────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recipe Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                TheMealDB does not provide times or serving counts. Please enter them below.
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="prepMins">Prep time (min)</Label>
                  <Input
                    id="prepMins"
                    type="number"
                    min="0"
                    placeholder="e.g. 15"
                    value={prepMins}
                    onChange={(e) => setPrepMins(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cookMins">Cook time (min)</Label>
                  <Input
                    id="cookMins"
                    type="number"
                    min="0"
                    placeholder="e.g. 30"
                    value={cookMins}
                    onChange={(e) => setCookMins(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="servings">Servings</Label>
                  <Input
                    id="servings"
                    type="number"
                    min="1"
                    placeholder="e.g. 4"
                    value={servings}
                    onChange={(e) => setServings(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button disabled={!allStepsValid} onClick={() => setStep(4)}>
              Review &amp; Save
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Review + save ─────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review Import</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Recipe" value={meal.strMeal} />
              <Row label="Category" value={meal.strCategory ?? "—"} />
              <Row label="Prep" value={`${prepMins} min`} />
              <Row label="Cook" value={`${cookMins} min`} />
              <Row label="Servings" value={servings} />
              <Row
                label="Ingredients matched"
                value={`${confirmedCount} / ${matches.length}`}
              />
              {confirmedCount < matches.length && (
                <p className="text-xs text-amber-700">
                  {matches.length - confirmedCount} ingredient(s) skipped - no nutrition data for those.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Duplicate dialog */}
          {duplicate && (
            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="py-4 space-y-3">
                <p className="text-sm font-medium text-amber-800">
                  This recipe was already imported as &ldquo;{duplicate.name}&rdquo;.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDuplicateAction("open")}
                  >
                    Open Existing
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => handleDuplicateAction("replace")}
                  >
                    Replace Existing
                  </Button>
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={() => handleDuplicateAction("duplicate")}
                  >
                    Import as Duplicate
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
            {!duplicate && (
              <Button disabled={saving} onClick={() => handleSave(null)}>
                {saving ? "Saving..." : "Save Recipe"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  const steps = ["View", "Match", "Details", "Save"];
  return (
    <div className="flex items-center gap-1">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = current === n;
        const done = current > n;
        return (
          <div key={n} className="flex items-center gap-1">
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                active ? "bg-primary text-primary-foreground" : done ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
              )}
            >
              {done ? "v" : n}
            </div>
            <span className={cn("text-xs hidden sm:inline", active ? "font-medium" : "text-muted-foreground")}>
              {label}
            </span>
            {i < steps.length - 1 && <div className="w-4 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
