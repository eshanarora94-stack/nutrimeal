import Link from "next/link";
import { prisma } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecipeBadge } from "@/components/recipe-badge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const recipes = await prisma.recipe.findMany({
    orderBy: { createdAt: "desc" },
    include: { ingredients: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recipes</h1>
          <p className="text-muted-foreground">{recipes.length} recipes saved</p>
        </div>
        <div className="flex gap-2">
          <Link href="/recipes/discover" className={cn(buttonVariants({ variant: "outline" }))}>
            Discover
          </Link>
          <Link href="/recipes/new" className={cn(buttonVariants())}>
            + Add Recipe
          </Link>
        </div>
      </div>

      {recipes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <p className="text-muted-foreground">No recipes yet.</p>
            <Link href="/recipes/new" className={cn(buttonVariants())}>
              Create your first recipe
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <Link key={recipe.id} href={`/recipes/${recipe.id}`} className="block">
              <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                {recipe.imageUrl && (
                  <img src={recipe.imageUrl} alt={recipe.name} className="h-40 w-full rounded-t-lg object-cover" />
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-base line-clamp-1">{recipe.name}</CardTitle>
                  {recipe.category && <p className="text-xs text-muted-foreground">{recipe.category}</p>}
                </CardHeader>
                <CardContent className="space-y-2">
                  <RecipeBadge
                    difficulty={recipe.difficulty} prepMins={recipe.prepMins}
                    cookMins={recipe.cookMins} isFavorite={recipe.isFavorite}
                    nutritionScore={recipe.nutritionScore}
                  />
                  <p className="text-xs text-muted-foreground">
                    {recipe.ingredients.length} ingredients · {recipe.servings} servings
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
