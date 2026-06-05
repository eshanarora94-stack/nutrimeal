import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const plan = await prisma.mealPlan.findUnique({ where: { id } });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Cascade: delete snapshot first (SQLite doesn't do cascades automatically)
  await prisma.mealPlanNutritionSnapshot.deleteMany({ where: { mealPlanId: id } });
  await prisma.mealPlan.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
