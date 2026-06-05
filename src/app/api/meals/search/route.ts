import { NextRequest, NextResponse } from "next/server";
import { searchMeals, filterByCategory } from "@/lib/themealdb";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q");
  const category = searchParams.get("category");

  if (category) {
    const meals = await filterByCategory(category);
    return NextResponse.json({ meals });
  }

  if (q) {
    const meals = await searchMeals(q);
    return NextResponse.json({ meals });
  }

  return NextResponse.json({ error: "q or category param required" }, { status: 400 });
}
