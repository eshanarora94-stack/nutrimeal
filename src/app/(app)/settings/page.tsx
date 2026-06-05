"use client";

import useSWR from "swr";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download } from "lucide-react";

interface GoalForm {
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
  sodiumMg: string;
}

const DEFAULTS: GoalForm = {
  calories: "2000",
  proteinG: "50",
  carbsG: "275",
  fatG: "78",
  fiberG: "28",
  sodiumMg: "2300",
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SettingsPage() {
  const { data: goals, isLoading } = useSWR("/api/goals", fetcher);

  const [form, setForm] = useState<GoalForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Initialise form once goals load (only on first load)
  const effectiveForm: GoalForm = form ?? (goals
    ? {
        calories: String(goals.calories ?? DEFAULTS.calories),
        proteinG: String(goals.proteinG ?? DEFAULTS.proteinG),
        carbsG: String(goals.carbsG ?? DEFAULTS.carbsG),
        fatG: String(goals.fatG ?? DEFAULTS.fatG),
        fiberG: String(goals.fiberG ?? DEFAULTS.fiberG),
        sodiumMg: String(goals.sodiumMg ?? DEFAULTS.sodiumMg),
      }
    : DEFAULTS);

  function set(field: keyof GoalForm, value: string) {
    setForm({ ...effectiveForm, [field]: value });
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      calories: Number(effectiveForm.calories),
      proteinG: Number(effectiveForm.proteinG),
      carbsG: Number(effectiveForm.carbsG),
      fatG: Number(effectiveForm.fatG),
      fiberG: effectiveForm.fiberG ? Number(effectiveForm.fiberG) : null,
      sodiumMg: effectiveForm.sodiumMg ? Number(effectiveForm.sodiumMg) : null,
    };

    if (
      isNaN(payload.calories) || payload.calories <= 0 ||
      isNaN(payload.proteinG) || payload.proteinG <= 0 ||
      isNaN(payload.carbsG) || payload.carbsG <= 0 ||
      isNaN(payload.fatG) || payload.fatG <= 0
    ) {
      setError("Calories, protein, carbs, and fat must be positive numbers.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save goals.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nutrimeal-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — user will notice the download didn't happen
    } finally {
      setExporting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set your daily nutrition targets. These drive the dashboard score and deficiency alerts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily Nutrition Goals</CardTitle>
          <CardDescription>
            Based on FDA Daily Values for a 2,000 kcal adult. Adjust to match your needs.
            <span className="mt-1 block italic">Planning guide — not medical advice.</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Calories (kcal)" id="calories" value={effectiveForm.calories} onChange={(v) => set("calories", v)} />
              <Field label="Protein (g)"     id="proteinG" value={effectiveForm.proteinG} onChange={(v) => set("proteinG", v)} />
              <Field label="Carbohydrates (g)" id="carbsG" value={effectiveForm.carbsG}  onChange={(v) => set("carbsG", v)} />
              <Field label="Total Fat (g)"   id="fatG"     value={effectiveForm.fatG}     onChange={(v) => set("fatG", v)} />
              <Field label="Fiber (g)"       id="fiberG"   value={effectiveForm.fiberG}   onChange={(v) => set("fiberG", v)} placeholder="28" />
              <Field label="Sodium (mg)"     id="sodiumMg" value={effectiveForm.sodiumMg} onChange={(v) => set("sodiumMg", v)} placeholder="2300" />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Saving…</> : "Save Goals"}
              </Button>
              {saved && <p className="text-sm text-emerald-600">Goals saved.</p>}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Data export */}
      <Card>
        <CardHeader>
          <CardTitle>Data Export</CardTitle>
          <CardDescription>Download all your NutriMeal data as JSON.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleExport} disabled={exporting} className="gap-1.5">
            {exporting
              ? <><Loader2 className="size-3.5 animate-spin" />Exporting…</>
              : <><Download className="size-3.5" />Export JSON</>
            }
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label, id, value, onChange, placeholder,
}: {
  label: string; id: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id} type="number" min="0" step="any"
        value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
