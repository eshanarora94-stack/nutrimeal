import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { resolveAmountGrams } from "@/lib/density";
import { parseIngredientMeasure } from "@/lib/units";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const search = searchParams.get("q") ?? "";
  const tag = searchParams.get("tag");
  const favorite = searchParams.get("favorite");
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "20");

  const recipes = await prisma.recipe.findMany({
    where: {
      name: search ? { contains: search } : undefined,
      isFavorite: favorite === "true" ? true : undefined,
    },
    include: { ingredients: { include: { ingredient: true } }, source_record: true },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const filtered = tag
    ? recipes.filter((r) => {
        const tags = JSON.parse((r.tags as string | null) ?? "[]") as string[];
        return tags.includes(tag);
      })
    : recipes;

  const total = await prisma.recipe.count({
    where: { name: search ? { contains: search } : undefined },
  });

  return NextResponse.json({ recipes: filtered, total, page, pageSize });
}

type IngredientInput = {
  ingredientId: string;
  amount: number;
  unit: string;
  displayText?: string;
};

async function buildIngredientCreates(inputs: IngredientInput[]) {
  const densities = await prisma.ingredientDensity.findMany();
  return Promise.all(
    inputs.map(async (inp) => {
      const parsed = parseIngredientMeasure(`${inp.amount} ${inp.unit}`);
      const ingredient = await prisma.ingredient.findUnique({ where: { id: inp.ingredientId } });
      const resolution = ingredient
        ? resolveAmountGrams(parsed, ingredient.name, densities)
        : { grams: null, confident: false as const };
      return {
        ingredientId: inp.ingredientId,
        amount: inp.amount,
        unit: inp.unit,
        amountGrams: resolution.confident ? (resolution as { grams: number }).grams : null,
        displayText: inp.displayText ?? null,
      };
    })
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    name,
    source = "custom",
    instructions,
    prepMins,
    cookMins,
    servings,
    category,
    imageUrl,
    notes,
    tags,
    difficulty,
    ingredients: ingredientInputs = [],
    provider,
    externalId,
    sourceUrl,
    duplicateAction,
  } = body;

  if (!name || !instructions || prepMins == null || cookMins == null || !servings) {
    return NextResponse.json(
      { error: "Missing required fields: name, instructions, prepMins, cookMins, servings" },
      { status: 400 }
    );
  }

  // Duplicate detection: check if same provider+externalId already exists
  if (provider && externalId && !duplicateAction) {
    const existing = await prisma.recipeSource.findFirst({
      where: { provider, externalId: String(externalId) },
      include: { recipe: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "duplicate", existingId: existing.recipeId, existingName: existing.recipe.name },
        { status: 409 }
      );
    }
  }

  // Replace action: delete old recipe and all related data first
  if (provider && externalId && duplicateAction === "replace") {
    const existing = await prisma.recipeSource.findFirst({
      where: { provider, externalId: String(externalId) },
    });
    if (existing) {
      const mealPlans = await prisma.mealPlan.findMany({
        where: { recipeId: existing.recipeId },
      });
      for (const mp of mealPlans) {
        await prisma.mealPlanNutritionSnapshot.deleteMany({ where: { mealPlanId: mp.id } });
      }
      await prisma.mealPlan.deleteMany({ where: { recipeId: existing.recipeId } });
      await prisma.recipeIngredient.deleteMany({ where: { recipeId: existing.recipeId } });
      await prisma.recipeSource.delete({ where: { id: existing.id } });
      await prisma.recipe.delete({ where: { id: existing.recipeId } });
    }
  }

  const ingredientCreates = await buildIngredientCreates(ingredientInputs as IngredientInput[]);

  const recipe = await prisma.recipe.create({
    data: {
      name,
      source,
      instructions:
        typeof instructions === "string" ? instructions : JSON.stringify(instructions),
      prepMins: Number(prepMins),
      cookMins: Number(cookMins),
      servings: Number(servings),
      category: category ?? null,
      imageUrl: imageUrl ?? null,
      notes: notes ?? null,
      tags: tags ? JSON.stringify(tags) : Prisma.JsonNull,
      difficulty: difficulty ?? null,
      ingredients: { create: ingredientCreates },
      ...(provider
        ? {
            source_record: {
              create: {
                provider,
                externalId: externalId ? String(externalId) : null,
                sourceUrl: sourceUrl ?? null,
              },
            },
          }
        : {}),
    },
    include: { source_record: true },
  });

  return NextResponse.json(recipe, { status: 201 });
}
