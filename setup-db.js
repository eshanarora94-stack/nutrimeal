require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SQL = `
CREATE TABLE IF NOT EXISTS "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "nutrients" JSONB NOT NULL,
    "lastFetched" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "prepMins" INT NOT NULL,
    "cookMins" INT NOT NULL,
    "servings" INT NOT NULL,
    "category" TEXT,
    "imageUrl" TEXT,
    "notes" TEXT,
    "tags" JSONB,
    "difficulty" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "timesCooked" INT NOT NULL DEFAULT 0,
    "lastCookedAt" TIMESTAMPTZ,
    "totalCookedWeightG" FLOAT8,
    "nutritionScore" FLOAT8,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "amount" FLOAT8 NOT NULL,
    "unit" TEXT NOT NULL,
    "amountGrams" FLOAT8,
    "displayText" TEXT,
    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "RecipeSource" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "sourceUrl" TEXT,
    "importedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "RecipeSource_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecipeSource_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "RecipeSource_recipeId_key" ON "RecipeSource"("recipeId");
CREATE TABLE IF NOT EXISTS "MealPlan" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMPTZ NOT NULL,
    "mealType" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "servings" FLOAT8 NOT NULL,
    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MealPlan_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "MealPlanNutritionSnapshot" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "calories" FLOAT8,
    "proteinG" FLOAT8,
    "carbsG" FLOAT8,
    "fatG" FLOAT8,
    "fiberG" FLOAT8,
    "sodiumMg" FLOAT8,
    "fullNutrients" JSONB NOT NULL,
    "calculatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "MealPlanNutritionSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MealPlanNutritionSnapshot_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MealPlanNutritionSnapshot_mealPlanId_key" ON "MealPlanNutritionSnapshot"("mealPlanId");
CREATE TABLE IF NOT EXISTS "NutritionGoal" (
    "id" TEXT NOT NULL,
    "calories" INT NOT NULL,
    "proteinG" FLOAT8 NOT NULL,
    "carbsG" FLOAT8 NOT NULL,
    "fatG" FLOAT8 NOT NULL,
    "fiberG" FLOAT8,
    "sodiumMg" FLOAT8,
    "customGoals" JSONB,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "NutritionGoal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "NutrientReference" (
    "id" TEXT NOT NULL,
    "nutrientId" TEXT NOT NULL,
    "nutrientNumber" TEXT,
    "nutrientName" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "aliases" JSONB,
    "unitName" TEXT NOT NULL,
    "defaultTarget" FLOAT8,
    "defaultUpperLimit" FLOAT8,
    "limitType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceDatasetVersion" TEXT,
    "verifiedAt" TIMESTAMPTZ,
    "notes" TEXT,
    CONSTRAINT "NutrientReference_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "PantryItem" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT,
    "name" TEXT NOT NULL,
    "amount" FLOAT8,
    "unit" TEXT,
    "amountGrams" FLOAT8,
    "category" TEXT,
    "expiresAt" TIMESTAMPTZ,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "PantryItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PantryItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "GroceryListItem" (
    "id" TEXT NOT NULL,
    "weekStartDate" TIMESTAMPTZ NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "ingredientId" TEXT,
    "category" TEXT,
    "totalAmount" FLOAT8,
    "totalUnit" TEXT,
    "totalGrams" FLOAT8,
    "displayText" TEXT NOT NULL,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "fromPantry" BOOLEAN NOT NULL DEFAULT false,
    "sourceRecipeIds" JSONB,
    "coveredByPantryGrams" FLOAT8,
    "remainingToBuyGrams" FLOAT8,
    CONSTRAINT "GroceryListItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "IngredientDensity" (
    "id" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "gramsPerCup" FLOAT8,
    "gramsPerTablespoon" FLOAT8,
    "gramsPerTeaspoon" FLOAT8,
    "gramsPerPiece" FLOAT8,
    "gramsPerMl" FLOAT8,
    "notes" TEXT,
    "source" TEXT NOT NULL,
    CONSTRAINT "IngredientDensity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "applied_steps_count" INT NOT NULL DEFAULT 0,
    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260605133317_init';
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count")
VALUES (gen_random_uuid()::text,'manually_applied',NOW(),'20260605133317_init',1);
`;

async function main() {
  const client = await pool.connect();
  try {
    console.log("Connected to Supabase. Creating tables...");
    await client.query(SQL);
    console.log("Done — all tables created.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
