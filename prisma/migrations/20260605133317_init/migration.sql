-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "nutrients" JSONB NOT NULL,
    "lastFetched" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "lastCookedAt" DATETIME,
    "totalCookedWeightG" REAL,
    "nutritionScore" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "amountGrams" REAL,
    "displayText" TEXT,
    CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecipeSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "sourceUrl" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecipeSource_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "mealType" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "servings" REAL NOT NULL,
    CONSTRAINT "MealPlan_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MealPlanNutritionSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mealPlanId" TEXT NOT NULL,
    "calories" REAL,
    "proteinG" REAL,
    "carbsG" REAL,
    "fatG" REAL,
    "fiberG" REAL,
    "sodiumMg" REAL,
    "fullNutrients" JSONB NOT NULL,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MealPlanNutritionSnapshot_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NutritionGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "calories" INTEGER NOT NULL,
    "proteinG" REAL NOT NULL,
    "carbsG" REAL NOT NULL,
    "fatG" REAL NOT NULL,
    "fiberG" REAL,
    "sodiumMg" REAL,
    "customGoals" JSONB,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NutrientReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nutrientId" TEXT NOT NULL,
    "nutrientNumber" TEXT,
    "nutrientName" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "aliases" JSONB,
    "unitName" TEXT NOT NULL,
    "defaultTarget" REAL,
    "defaultUpperLimit" REAL,
    "limitType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceDatasetVersion" TEXT,
    "verifiedAt" DATETIME,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "PantryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ingredientId" TEXT,
    "name" TEXT NOT NULL,
    "amount" REAL,
    "unit" TEXT,
    "amountGrams" REAL,
    "category" TEXT,
    "expiresAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PantryItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroceryListItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekStartDate" DATETIME NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "ingredientId" TEXT,
    "category" TEXT,
    "totalAmount" REAL,
    "totalUnit" TEXT,
    "totalGrams" REAL,
    "displayText" TEXT NOT NULL,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "fromPantry" BOOLEAN NOT NULL DEFAULT false,
    "sourceRecipeIds" JSONB,
    "coveredByPantryGrams" REAL,
    "remainingToBuyGrams" REAL
);

-- CreateTable
CREATE TABLE "IngredientDensity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ingredientName" TEXT NOT NULL,
    "gramsPerCup" REAL,
    "gramsPerTablespoon" REAL,
    "gramsPerTeaspoon" REAL,
    "gramsPerPiece" REAL,
    "gramsPerMl" REAL,
    "notes" TEXT,
    "source" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeSource_recipeId_key" ON "RecipeSource"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlanNutritionSnapshot_mealPlanId_key" ON "MealPlanNutritionSnapshot"("mealPlanId");
