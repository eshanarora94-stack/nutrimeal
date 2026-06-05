-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "nutrients" JSONB NOT NULL,
    "lastFetched" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "prepMins" INTEGER NOT NULL,
    "cookMins" INTEGER NOT NULL,
    "servings" INTEGER NOT NULL,
    "category" TEXT,
    "imageUrl" TEXT,
    "notes" TEXT,
    "tags" JSONB,
    "difficulty" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "timesCooked" INTEGER NOT NULL DEFAULT 0,
    "lastCookedAt" TIMESTAMP(3),
    "totalCookedWeightG" DOUBLE PRECISION,
    "nutritionScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "amountGrams" DOUBLE PRECISION,
    "displayText" TEXT,
    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeSource" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "sourceUrl" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecipeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mealType" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "servings" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlanNutritionSnapshot" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "calories" DOUBLE PRECISION,
    "proteinG" DOUBLE PRECISION,
    "carbsG" DOUBLE PRECISION,
    "fatG" DOUBLE PRECISION,
    "fiberG" DOUBLE PRECISION,
    "sodiumMg" DOUBLE PRECISION,
    "fullNutrients" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MealPlanNutritionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionGoal" (
    "id" TEXT NOT NULL,
    "calories" INTEGER NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "carbsG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "fiberG" DOUBLE PRECISION,
    "sodiumMg" DOUBLE PRECISION,
    "customGoals" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NutritionGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutrientReference" (
    "id" TEXT NOT NULL,
    "nutrientId" TEXT NOT NULL,
    "nutrientNumber" TEXT,
    "nutrientName" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "aliases" JSONB,
    "unitName" TEXT NOT NULL,
    "defaultTarget" DOUBLE PRECISION,
    "defaultUpperLimit" DOUBLE PRECISION,
    "limitType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceDatasetVersion" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    CONSTRAINT "NutrientReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PantryItem" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "unit" TEXT,
    "amountGrams" DOUBLE PRECISION,
    "category" TEXT,
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PantryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryListItem" (
    "id" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "ingredientId" TEXT,
    "category" TEXT,
    "totalAmount" DOUBLE PRECISION,
    "totalUnit" TEXT,
    "totalGrams" DOUBLE PRECISION,
    "displayText" TEXT NOT NULL,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "fromPantry" BOOLEAN NOT NULL DEFAULT false,
    "sourceRecipeIds" JSONB,
    "coveredByPantryGrams" DOUBLE PRECISION,
    "remainingToBuyGrams" DOUBLE PRECISION,
    CONSTRAINT "GroceryListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientDensity" (
    "id" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "gramsPerCup" DOUBLE PRECISION,
    "gramsPerTablespoon" DOUBLE PRECISION,
    "gramsPerTeaspoon" DOUBLE PRECISION,
    "gramsPerPiece" DOUBLE PRECISION,
    "gramsPerMl" DOUBLE PRECISION,
    "notes" TEXT,
    "source" TEXT NOT NULL,
    CONSTRAINT "IngredientDensity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeSource_recipeId_key" ON "RecipeSource"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlanNutritionSnapshot_mealPlanId_key" ON "MealPlanNutritionSnapshot"("mealPlanId");

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeSource" ADD CONSTRAINT "RecipeSource_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanNutritionSnapshot" ADD CONSTRAINT "MealPlanNutritionSnapshot_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mark migration as applied in Prisma history
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260605133317_init';
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'manually_applied', NOW(), '20260605133317_init', 1);
