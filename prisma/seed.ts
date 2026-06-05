import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { seedNutrientReferences } from "./seed-nutrient-references";

function makePrisma() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = makePrisma();

interface DensityRecord {
  id: string;
  ingredientName: string;
  gramsPerCup?: number;
  gramsPerTablespoon?: number;
  gramsPerTeaspoon?: number;
  gramsPerPiece?: number;
  gramsPerMl?: number;
  notes?: string;
  source: string;
}

function densityId(name: string): string {
  return Buffer.from(name).toString("base64url").slice(0, 36);
}

const DENSITY_RECORDS: DensityRecord[] = [
  // Flours & Starches
  { id: densityId("all-purpose flour"), ingredientName: "all-purpose flour", gramsPerCup: 120, gramsPerTablespoon: 7.5, gramsPerTeaspoon: 2.5, source: "seeded", notes: "spooned & leveled" },
  { id: densityId("whole wheat flour"), ingredientName: "whole wheat flour", gramsPerCup: 130, gramsPerTablespoon: 8.1, gramsPerTeaspoon: 2.7, source: "seeded" },
  { id: densityId("cornstarch"), ingredientName: "cornstarch", gramsPerCup: 128, gramsPerTablespoon: 8, gramsPerTeaspoon: 2.7, source: "seeded" },
  { id: densityId("breadcrumbs"), ingredientName: "breadcrumbs", gramsPerCup: 108, gramsPerTablespoon: 6.75, source: "seeded", notes: "dry, plain" },
  // Sugars & Sweeteners
  { id: densityId("white sugar"), ingredientName: "white sugar", gramsPerCup: 200, gramsPerTablespoon: 12.5, gramsPerTeaspoon: 4.2, source: "seeded" },
  { id: densityId("brown sugar"), ingredientName: "brown sugar", gramsPerCup: 220, gramsPerTablespoon: 13.75, gramsPerTeaspoon: 4.6, source: "seeded", notes: "packed" },
  { id: densityId("honey"), ingredientName: "honey", gramsPerCup: 340, gramsPerTablespoon: 21.25, gramsPerTeaspoon: 7.1, gramsPerMl: 1.44, source: "seeded" },
  { id: densityId("maple syrup"), ingredientName: "maple syrup", gramsPerCup: 322, gramsPerTablespoon: 20.1, gramsPerTeaspoon: 6.7, gramsPerMl: 1.36, source: "seeded" },
  // Grains
  { id: densityId("rolled oats"), ingredientName: "rolled oats", gramsPerCup: 90, gramsPerTablespoon: 5.6, source: "seeded" },
  { id: densityId("steel-cut oats"), ingredientName: "steel-cut oats", gramsPerCup: 180, gramsPerTablespoon: 11.25, source: "seeded" },
  { id: densityId("white rice raw"), ingredientName: "white rice raw", gramsPerCup: 185, gramsPerTablespoon: 11.6, source: "seeded" },
  { id: densityId("white rice cooked"), ingredientName: "white rice cooked", gramsPerCup: 186, gramsPerTablespoon: 11.6, source: "seeded" },
  { id: densityId("dry pasta"), ingredientName: "dry pasta", gramsPerCup: 100, gramsPerTablespoon: 6.25, source: "seeded", notes: "short pasta like penne" },
  // Dairy & Eggs
  { id: densityId("butter"), ingredientName: "butter", gramsPerCup: 227, gramsPerTablespoon: 14.2, gramsPerTeaspoon: 4.7, source: "seeded" },
  { id: densityId("whole milk"), ingredientName: "whole milk", gramsPerCup: 244, gramsPerTablespoon: 15.25, gramsPerTeaspoon: 5.1, gramsPerMl: 1.03, source: "seeded" },
  { id: densityId("2% milk"), ingredientName: "2% milk", gramsPerCup: 244, gramsPerTablespoon: 15.25, gramsPerTeaspoon: 5.1, gramsPerMl: 1.03, source: "seeded" },
  { id: densityId("heavy cream"), ingredientName: "heavy cream", gramsPerCup: 238, gramsPerTablespoon: 14.9, gramsPerTeaspoon: 5.0, gramsPerMl: 1.01, source: "seeded" },
  { id: densityId("plain yogurt"), ingredientName: "plain yogurt", gramsPerCup: 245, gramsPerTablespoon: 15.3, source: "seeded" },
  { id: densityId("shredded cheddar"), ingredientName: "shredded cheddar", gramsPerCup: 113, gramsPerTablespoon: 7.1, source: "seeded" },
  { id: densityId("egg"), ingredientName: "egg", gramsPerPiece: 50, source: "seeded", notes: "large whole egg, shell removed" },
  // Oils
  { id: densityId("olive oil"), ingredientName: "olive oil", gramsPerCup: 218, gramsPerTablespoon: 13.5, gramsPerTeaspoon: 4.5, gramsPerMl: 0.92, source: "seeded" },
  { id: densityId("vegetable oil"), ingredientName: "vegetable oil", gramsPerCup: 218, gramsPerTablespoon: 13.6, gramsPerTeaspoon: 4.5, gramsPerMl: 0.92, source: "seeded" },
  { id: densityId("coconut oil"), ingredientName: "coconut oil", gramsPerCup: 218, gramsPerTablespoon: 13.6, gramsPerTeaspoon: 4.5, gramsPerMl: 0.92, source: "seeded" },
  // Nut Butters
  { id: densityId("peanut butter"), ingredientName: "peanut butter", gramsPerCup: 258, gramsPerTablespoon: 16.1, gramsPerTeaspoon: 5.4, source: "seeded" },
  { id: densityId("almond butter"), ingredientName: "almond butter", gramsPerCup: 258, gramsPerTablespoon: 16.1, gramsPerTeaspoon: 5.4, source: "seeded" },
  // Proteins
  { id: densityId("chicken breast raw"), ingredientName: "chicken breast raw", gramsPerCup: 140, source: "seeded", notes: "diced/cubed" },
  { id: densityId("chicken breast cooked"), ingredientName: "chicken breast cooked", gramsPerCup: 140, source: "seeded", notes: "diced/cubed" },
  { id: densityId("ground beef raw"), ingredientName: "ground beef raw", gramsPerCup: 225, source: "seeded" },
  { id: densityId("salmon fillet"), ingredientName: "salmon fillet", gramsPerCup: 150, source: "seeded", notes: "cubed" },
  // Legumes
  { id: densityId("canned beans drained"), ingredientName: "canned beans drained", gramsPerCup: 170, gramsPerTablespoon: 10.6, source: "seeded", notes: "kidney, black, or pinto" },
  { id: densityId("dry lentils"), ingredientName: "dry lentils", gramsPerCup: 192, gramsPerTablespoon: 12, source: "seeded" },
  { id: densityId("cooked lentils"), ingredientName: "cooked lentils", gramsPerCup: 198, gramsPerTablespoon: 12.4, source: "seeded" },
  { id: densityId("chickpeas canned drained"), ingredientName: "chickpeas canned drained", gramsPerCup: 164, gramsPerTablespoon: 10.25, source: "seeded" },
  // Nuts & Seeds
  { id: densityId("whole almonds"), ingredientName: "whole almonds", gramsPerCup: 143, gramsPerTablespoon: 8.9, source: "seeded" },
  { id: densityId("walnut halves"), ingredientName: "walnut halves", gramsPerCup: 117, gramsPerTablespoon: 7.3, source: "seeded" },
  { id: densityId("cashews"), ingredientName: "cashews", gramsPerCup: 137, gramsPerTablespoon: 8.6, source: "seeded" },
  { id: densityId("chia seeds"), ingredientName: "chia seeds", gramsPerCup: 160, gramsPerTablespoon: 10, gramsPerTeaspoon: 3.3, source: "seeded" },
  // Vegetables
  { id: densityId("raw chopped spinach"), ingredientName: "raw chopped spinach", gramsPerCup: 30, gramsPerTablespoon: 1.9, source: "seeded" },
  { id: densityId("broccoli florets"), ingredientName: "broccoli florets", gramsPerCup: 91, source: "seeded" },
  { id: densityId("diced onion"), ingredientName: "diced onion", gramsPerCup: 160, gramsPerTablespoon: 10, source: "seeded" },
  { id: densityId("minced garlic"), ingredientName: "minced garlic", gramsPerCup: 136, gramsPerTablespoon: 8.5, gramsPerTeaspoon: 2.8, source: "seeded" },
  { id: densityId("cubed potato"), ingredientName: "cubed potato", gramsPerCup: 150, source: "seeded" },
  { id: densityId("diced tomato"), ingredientName: "diced tomato", gramsPerCup: 180, gramsPerTablespoon: 11.25, source: "seeded" },
  { id: densityId("sliced carrot"), ingredientName: "sliced carrot", gramsPerCup: 122, gramsPerTablespoon: 7.6, source: "seeded" },
  { id: densityId("diced bell pepper"), ingredientName: "diced bell pepper", gramsPerCup: 149, gramsPerTablespoon: 9.3, source: "seeded" },
  { id: densityId("sliced mushrooms"), ingredientName: "sliced mushrooms", gramsPerCup: 70, gramsPerTablespoon: 4.4, source: "seeded" },
  // Condiments
  { id: densityId("soy sauce"), ingredientName: "soy sauce", gramsPerCup: 255, gramsPerTablespoon: 16, gramsPerTeaspoon: 5.3, gramsPerMl: 1.08, source: "seeded" },
  { id: densityId("tomato paste"), ingredientName: "tomato paste", gramsPerCup: 262, gramsPerTablespoon: 16.4, gramsPerTeaspoon: 5.5, source: "seeded" },
  { id: densityId("greek yogurt"), ingredientName: "greek yogurt", gramsPerCup: 245, gramsPerTablespoon: 15.3, source: "seeded" },
  { id: densityId("panko breadcrumbs"), ingredientName: "panko breadcrumbs", gramsPerCup: 60, gramsPerTablespoon: 3.75, source: "seeded" },
];

async function seedIngredientDensities(): Promise<void> {
  console.log("Seeding IngredientDensity records…");
  await prisma.$transaction(
    DENSITY_RECORDS.map((r) =>
      prisma.ingredientDensity.upsert({
        where: { id: r.id },
        create: r,
        update: r,
      })
    )
  );
  console.log(`✓ ${DENSITY_RECORDS.length} IngredientDensity records seeded.`);
}

async function main() {
  try {
    await seedNutrientReferences();
    await seedIngredientDensities();
    console.log("\n✓ Seed complete.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
