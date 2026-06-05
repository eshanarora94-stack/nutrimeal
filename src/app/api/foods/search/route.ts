import { NextRequest, NextResponse } from "next/server";
import { searchFoods } from "@/lib/usda";
import { prisma } from "@/lib/db";
import { isCacheStale, extractNutrients, extractCategory, getFoodDetail } from "@/lib/usda";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const query = searchParams.get("q")?.trim();
  const pageSize = Number(searchParams.get("pageSize") ?? "10");
  const pageNumber = Number(searchParams.get("page") ?? "1");

  if (!query) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  try {
    const result = await searchFoods(query, { pageSize, pageNumber });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
