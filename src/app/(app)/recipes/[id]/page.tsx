import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecipeBadge } from "@/components/recipe-badge";
import { calculateRecipeNutrition } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: { ingredients: { include: { ingredient: true } }, source_record: true },
  });
  if (!recipe) notFound();

  const steps: string[] = (() => {
    try { return JSON.parse(recipe.instructions) as string[]; } catch { return [recipe.instructions]; }
  })();
  const tags: string[] = (() => {
    try { return JSON.parse((recipe.tags as string | null) ?? "[]") as string[]; } catch { return []; }
  })();

  const { perServing } = calculateRecipeNutrition({
    servings: recipe.servings,
    ingredients: recipe.ingredients.map((ri) => ({
      amount: ri.amount, unit: ri.unit, amountGrams: ri.amountGrams,
      ingredient: { nutrients: ri.ingredient.nutrients },
    })),
  });

  const getN = (name: string) =>
    perServing.find((n) => n.nutrientName.toLowerCase().includes(name))?.amount ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/recipes" className="text-sm text-muted-foreground hover:underline">← Recipes</Link>
          <h1 className="mt-1 text-2xl font-bold">{recipe.name}</h1>
          {recipe.category && <p className="text-muted-foreground">{recipe.category}</p>}
        </div>
        <Link href={`/recipes/${id}/edit`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Edit
        </Link>
      </div>

      {recipe.imageUrl && (
        <img src={recipe.imageUrl} alt={recipe.name} className="h-64 w-full rounded-xl object-cover" />
      )}

      <RecipeBadge difficulty={recipe.difficulty} prepMins={recipe.prepMins}
        cookMins={recipe.cookMins} isFavorite={recipe.isFavorite} nutritionScore={recipe.nutritionScore} />

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => <span key={t} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">{t}</span>)}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Ingredients ({recipe.servings} servings)</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {recipe.ingredients.map((ri) => (
                <li key={ri.id} className="flex justify-between">
                  <span>{ri.ingredient.name}</span>
                  <span className="text-muted-foreground">
                    {ri.displayText ?? `${ri.amount} ${ri.unit}`}
                    {ri.amountGrams != null && <span className="ml-1 text-xs opacity-60">({Math.round(ri.amountGrams)}g)</span>}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Nutrition per serving</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {[
                { label: "Calories", value: Math.round(getN("energy")), unit: "kcal" },
                { label: "Protein", value: Math.round(getN("protein") * 10) / 10, unit: "g" },
                { label: "Carbs", value: Math.round(getN("carbohydrate") * 10) / 10, unit: "g" },
                { label: "Fat", value: Math.round(getN("fat") * 10) / 10, unit: "g" },
                { label: "Fiber", value: Math.round(getN("fiber") * 10) / 10, unit: "g" },
                { label: "Sodium", value: Math.round(getN("sodium")), unit: "mg" },
              ].map(({ label, value, unit }) => (
                <div key={label} className="flex justify-between border-b pb-1 last:border-0">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}{unit}</span>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      {steps.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Instructions</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{i + 1}</span>
                  <p className="leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {recipe.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{recipe.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
