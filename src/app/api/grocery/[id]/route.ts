/**
 * PATCH /api/grocery/:id  — toggle isChecked (or update any field)
 * DELETE /api/grocery/:id — remove a single item
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const item = await prisma.groceryListItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.groceryListItem.update({
    where: { id },
    data: {
      isChecked: body.isChecked ?? item.isChecked,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await prisma.groceryListItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.groceryListItem.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
