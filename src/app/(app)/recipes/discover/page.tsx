"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import useSWR from "swr";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { SkeletonCard } from "@/components/skeleton";
import { cn } from "@/lib/utils";
import { fetcher } from "@/lib/fetcher";

interface MealStub {
  idMeal: string;
  strMeal: string;
  strMealThumb: string | null;
  strCategory?: string | null;
}

interface Category {
  idCategory: string;
  strCategory: string;
}

export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [meals, setMeals] = useState<MealStub[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // SWR for categories — cached across navigation
  const { data: catData } = useSWR<{ categories: Category[] }>(
    "https://www.themealdb.com/api/json/v1/1/categories.php",
    fetcher,
    { revalidateOnFocus: false }
  );
  const categories = catData?.categories ?? [];

  const search = useCallback(async (q: string, cat: string | null) => {
    setLoading(true);
    setSearched(true);
    try {
      const params = cat
        ? `category=${encodeURIComponent(cat)}`
        : `q=${encodeURIComponent(q || "a")}`;
      const data = await fetcher<{ meals: MealStub[] | null }>(`/api/meals/search?${params}`);
      setMeals(data.meals ?? []);
    } catch {
      setMeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSelectedCategory(null);
    search(query, null);
  }

  function handleCategory(cat: string) {
    const next = selectedCategory === cat ? null : cat;
    setSelectedCategory(next);
    setQuery("");
    if (next) search("", next);
    else { setMeals([]); setSearched(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Discover Recipes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse TheMealDB and import recipes with USDA nutrition data.
          </p>
        </div>
        <Link href="/recipes" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Back to Recipes
        </Link>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex max-w-lg gap-2">
        <Input
          placeholder="Search meals (e.g. chicken, pasta…)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <Badge
              key={c.idCategory}
              variant={selectedCategory === c.strCategory ? "default" : "outline"}
              className="cursor-pointer select-none"
              onClick={() => handleCategory(c.strCategory)}
            >
              {c.strCategory}
            </Badge>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty / hint states */}
      {!loading && searched && meals.length === 0 && (
        <p className="text-sm text-muted-foreground">No results found. Try a different search.</p>
      )}
      {!loading && !searched && (
        <p className="text-sm text-muted-foreground">
          Search by name or select a category above.
        </p>
      )}

      {/* Results */}
      {!loading && meals.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {meals.map((meal) => (
            <Link key={meal.idMeal} href={`/recipes/discover/${meal.idMeal}`} className="group block">
              <Card className="overflow-hidden transition-shadow hover:shadow-md">
                {meal.strMealThumb && (
                  <div className="relative aspect-video w-full bg-muted">
                    <Image
                      src={`${meal.strMealThumb}/preview`}
                      alt={meal.strMeal}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    />
                  </div>
                )}
                <CardContent className="p-3">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{meal.strMeal}</p>
                  {meal.strCategory && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{meal.strCategory}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
