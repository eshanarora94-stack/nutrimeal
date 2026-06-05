import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { resolveAmountGrams } from "@/lib/density";
import { parseIngredientMeasure } from "@/lib/units";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: { ingredients: { include: { ingredient: true } }, source_record: true },
  });
  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(recipe);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const { name, instructions, prepMins, cookMins, servings, category, imageUrl, notes, tags, difficulty, isFavorite, ingredients: ingredientInputs } = body;

  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const densities = await prisma.ingredientDensity.findMany();

  if (ingredientInputs) {
    await prisma.recipeIngredient.deleteMany({ where: { recipeId: id } });
    for (const inp of ingredientInputs as Array<{ ingredientId: string; amount: number; unit: string; displayText?: string }>) {
      const parsed = parseIngredientMeasure(`${inp.amount} ${inp.unit}`);
      const ingredient = await prisma.ingredient.findUnique({ where: { id: inp.ingredientId } });
      const resolution = ingredient ? resolveAmountGrams(parsed, ingredient.name, densities) : { grams: null, confident: false };
      await prisma.recipeIngredient.create({
        data: {
          recipeId: id,
          ingredientId: inp.ingredientId,
          amount: inp.amount,
          unit: inp.unit,
          amountGrams: resolution.confident ? (resolution as { grams: number }).grams : null,
          displayText: inp.displayText ?? null,
        },
      });
    }
  }

  const updated = await prisma.recipe.update({
    where: { id },
    data: {
      name: name ?? existing.name,
      instructions: instructions != null ? (typeof instructions === "string" ? instructions : JSON.stringify(instructions)) : existing.instructions,
      prepMins: prepMins ?? existing.prepMins,
      cookMins: cookMins ?? existing.cookMins,
      servings: servings ?? existing.servings,
      category: category !== undefined ? category : existing.category,
      imageUrl: imageUrl !== undefined ? imageUrl : existing.imageUrl,
      notes: notes !== undefined ? notes : existing.notes,
      tags: tags !== undefined ? (tags ? JSON.stringify(tags) : Prisma.JsonNull) : (existing.tags as Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue),
      difficulty: difficulty !== undefined ? difficulty : existing.difficulty,
      isFavorite: isFavorite !== undefined ? isFavorite : existing.isFavorite,
    },
    include: { ingredients: { include: { ingredient: true } }, source_record: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.recipeIngredient.deleteMany({ where: { recipeId: id } });
  await prisma.recipeSource.deleteMany({ where: { recipeId: id } });
  await prisma.mealPlan.deleteMany({ where: { recipeId: id } });
  await prisma.recipe.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
