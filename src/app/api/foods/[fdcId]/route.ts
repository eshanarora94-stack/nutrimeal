import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getFoodDetail,
  extractNutrients,
  extractCategory,
  isCacheStale,
} from "@/lib/usda";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fdcId: string }> }
) {
  const { fdcId } = await params;

  // Check DB cache first
  const cached = await prisma.ingredient.findUnique({ where: { id: fdcId } });
  if (cached && !isCacheStale(cached.lastFetched)) {
    return NextResponse.json(cached);
  }

  try {
    const detail = await getFoodDetail(fdcId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nutrients = extractNutrients(detail) as any;
    const category = extractCategory(detail);

    const ingredient = await prisma.ingredient.upsert({
      where: { id: fdcId },
      create: {
        id: fdcId,
        name: detail.description,
        category,
        nutrients,
        lastFetched: new Date(),
      },
      update: {
        name: detail.description,
        category,
        nutrients,
        lastFetched: new Date(),
      },
    });

    return NextResponse.json(ingredient);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
