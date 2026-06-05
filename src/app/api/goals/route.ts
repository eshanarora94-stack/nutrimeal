import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const goal = await prisma.nutritionGoal.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (!goal) return NextResponse.json(null);
  return NextResponse.json(goal);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { calories, proteinG, carbsG, fatG, fiberG, sodiumMg, customGoals } = body;

  if (
    typeof calories !== "number" ||
    typeof proteinG !== "number" ||
    typeof carbsG !== "number" ||
    typeof fatG !== "number"
  ) {
    return NextResponse.json(
      { error: "calories, proteinG, carbsG, fatG are required numbers" },
      { status: 400 }
    );
  }

  // Single-user: always upsert the one record (delete old, create new to work around SQLite updatedAt)
  const existing = await prisma.nutritionGoal.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  const data = {
    calories: Math.round(calories),
    proteinG: Number(proteinG),
    carbsG: Number(carbsG),
    fatG: Number(fatG),
    fiberG: fiberG != null ? Number(fiberG) : null,
    sodiumMg: sodiumMg != null ? Number(sodiumMg) : null,
    customGoals: customGoals ?? null,
  };

  let goal;
  if (existing) {
    goal = await prisma.nutritionGoal.update({
      where: { id: existing.id },
      data,
    });
  } else {
    goal = await prisma.nutritionGoal.create({ data });
  }

  return NextResponse.json(goal);
}
