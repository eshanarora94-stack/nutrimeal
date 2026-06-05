/**
 * GET  /api/pantry          — list all pantry items (sorted: expiring soon first, then by name)
 * POST /api/pantry          — create a pantry item
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseIngredientMeasure } from "@/lib/units";
import { resolveAmountGrams } from "@/lib/density";

export async function GET() {
  const now = new Date();
  const soonThreshold = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const items = await prisma.pantryItem.findMany({
    include: { ingredient: true },
    orderBy: [{ expiresAt: "asc" }, { name: "asc" }],
  });

  // Tag each item with useSoon flag for the client
  const tagged = items.map((item) => ({
    ...item,
    useSoon:
      item.expiresAt != null &&
      item.expiresAt <= soonThreshold &&
      item.expiresAt >= now,
    expired: item.expiresAt != null && item.expiresAt < now,
  }));

  return NextResponse.json(tagged);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ingredientId, name, amount, unit, expiresAt, notes, category } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Resolve amountGrams if amount + unit provided
  let amountGrams: number | null = null;
  if (amount != null && unit) {
    const densities = await prisma.ingredientDensity.findMany();
    const parsed = parseIngredientMeasure(`${amount} ${unit}`);
    const resolved = resolveAmountGrams(parsed, name, densities);
    if (resolved.confident) {
      amountGrams = resolved.grams;
    }
  }

  const item = await prisma.pantryItem.create({
    data: {
      ingredientId: ingredientId ?? null,
      name,
      amount: amount != null ? Number(amount) : null,
      unit: unit ?? null,
      amountGrams,
      category: category ?? null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      notes: notes ?? null,
    },
    include: { ingredient: true },
  });

  return NextResponse.json(item, { status: 201 });
}
