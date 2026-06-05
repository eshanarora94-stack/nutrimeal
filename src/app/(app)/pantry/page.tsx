import { PantryManager } from "@/components/pantry-manager";

export const metadata = { title: "Pantry — NutriMeal" };

export default function PantryPage() {
  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Pantry</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track what you have on hand. Pantry stock is automatically deducted
          when generating your grocery list.
        </p>
      </div>
      <PantryManager />
    </div>
  );
}
