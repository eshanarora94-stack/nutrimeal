/**
 * PUT    /api/pantry/:id  — update a pantry item
 * DELETE /api/pantry/:id  — delete a pantry item
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseIngredientMeasure } from "@/lib/units";
import { resolveAmountGrams } from "@/lib/density";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { name, amount, unit, expiresAt, notes, category, isChecked } = body;

  const existing = await prisma.pantryItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Re-resolve amountGrams if amount or unit changed
  let amountGrams = existing.amountGrams;
  const effectiveName = name ?? existing.name;
  const effectiveAmount = amount != null ? Number(amount) : existing.amount;
  const effectiveUnit = unit ?? existing.unit;

  if (
    (amount != null || unit != null) &&
    effectiveAmount != null &&
    effectiveUnit
  ) {
    const densities = await prisma.ingredientDensity.findMany();
    const parsed = parseIngredientMeasure(`${effectiveAmount} ${effectiveUnit}`);
    const resolved = resolveAmountGrams(parsed, effectiveName, densities);
    if (resolved.confident) amountGrams = resolved.grams;
  }

  const updated = await prisma.pantryItem.update({
    where: { id },
    data: {
      name: name ?? undefined,
      amount: amount != null ? Number(amount) : undefined,
      unit: unit ?? undefined,
      amountGrams,
      category: category ?? undefined,
      expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined,
      notes: notes ?? undefined,
      ...(isChecked !== undefined ? {} : {}), // PantryItem has no isChecked; ignore
    },
    include: { ingredient: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await prisma.pantryItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.pantryItem.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
