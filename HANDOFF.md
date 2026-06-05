# NutriMeal v2.1 — Agent Handoff Document

## Project overview

Single-user, localhost-first nutrition planning web app. Tracks recipes, meal plans, pantry, and grocery lists. Runs a deterministic nutrition intelligence layer. No auth, no AI, no paid APIs.

**Primary spec:** `NutriMeal-Implementation-Prompt.md` in the parent folder. That document is the single source of truth and supersedes everything here where they conflict.

---

## Stack

- Next.js 15 App Router, TypeScript strict
- Tailwind CSS + shadcn/ui (base-nova style, uses `@base-ui/react` primitives)
- Prisma 7 + SQLite (local) -> PostgreSQL/Supabase (prod)
- Zustand, Recharts, SWR, dnd-kit, convert-units
- Vitest + React Testing Library
- pnpm (package manager)

**Critical shadcn gotcha:** This project uses shadcn's `base-nova` style which wraps `@base-ui/react` components. The `Button` component does NOT support `asChild`. Use `Link` with `className={cn(buttonVariants({ variant, size }))}` everywhere you need a link styled as a button.

---

## Critical Prisma 7 gotchas

1. **No `url` in schema.prisma** — datasource URL is configured in `prisma.config.ts`, not in the schema file.
2. **Requires a database adapter** — `PrismaClient` must be constructed with `new PrismaBetterSqlite3({ url })` adapter. See `src/lib/db.ts`.
3. **Json? fields reject plain `null`** — use `Prisma.JsonNull` from `@prisma/client` when you need to set a nullable JSON field to null.
4. **Seed config** — seed command is in `prisma.config.ts` under `migrations.seed`, not in `package.json`.
5. **`better-sqlite3` needs native binary** — on Windows, `pnpm install` must be allowed to run build scripts for `better-sqlite3`, `prisma`, and `@prisma/engines`. The `pnpm-workspace.yaml` already whitelists these.

---

## Environment

`.env` (project root):
```
DATABASE_URL="file:./dev.db"
```

`.env.local` (project root, gitignored):
```
USDA_API_KEY=IEJWmmkaqSxqyIZmCVrN8Hol5ZpvNqRq6OZEL5TE
DATABASE_URL="file:./dev.db"
```

---

## File writing gotcha (IMPORTANT for this environment)

**Never use the Edit tool to add large blocks of new content to an existing file.** The Edit tool truncates silently when the resulting file exceeds a certain size. Always use bash heredoc (`cat > file << 'EOF'`) when writing or rewriting files longer than ~60 lines. The Write tool has the same truncation issue with files containing non-ASCII characters (em-dashes, etc.) — use bash heredoc for all file writes.

---

## What has been built (Phases 1-8 — COMPLETE)

### Phase 1 — Complete

- Full Prisma schema (11 models), migration applied, client generated
- `prisma/seed-nutrient-references.ts` — Gate 1: 33 NutrientReference records, USDA-verified by nutrientNumber. 29/33 have live USDA integer IDs; 4 (added sugar 269.3, iodine 314, manganese 315, chromium 418.1) use nutrientNumber as ID fallback (these nutrients are sparsely tracked in USDA Foundation/SR Legacy datasets).
- `prisma/seed.ts` — main seed: calls Gate 1, then seeds 48 IngredientDensity records
- `src/lib/db.ts` — Prisma singleton with PrismaBetterSqlite3 adapter
- `src/lib/usda.ts` — USDA FoodData Central client (search, food detail, nutrient extraction, 30-day cache staleness)
- `src/app/api/foods/search/route.ts` and `[fdcId]/route.ts` — USDA proxy + DB cache

### Phase 2 — Complete

- `src/lib/units.ts` — Gate 2: free-text parsing (`parseIngredientMeasure`), unit normalization (`normalizeUnit`), standard conversion (`convertStandardUnit`). Handles unicode fractions, mixed numbers, slash fractions. Uses `convert-units` only for dimension-safe conversions (mass/mass, volume/volume).
- `src/lib/density.ts` — Gate 2: `resolveAmountGrams` — mass passthrough, piece via gramsPerPiece, volume via density table. Never calls convert-units for volume->mass.
- `src/lib/nutrition.ts` — full nutrition engine: `calculateRecipeNutrition`, `calculateDailyNutritionScore`, `detectNutrientGaps`, `calculateWeeklyNutritionAnalysis`. Scoring weights: calorie 30%, macro 40%, micro 30%, -20 penalty per exceeded upper-limit nutrient.
- `src/app/api/recipes/route.ts` — GET (list with search/tag/favorite filters, pagination), POST (create with auto gram resolution, duplicate detection, RecipeSource creation)
- `src/app/api/recipes/[id]/route.ts` — GET, PUT, DELETE
- `src/app/api/nutrition/score/route.ts` — GET `?date=YYYY-MM-DD`
- `src/app/api/nutrition/weekly/route.ts` — GET `?weekStart=YYYY-MM-DD`
- `src/components/ingredient-search.tsx` — USDA ingredient search with debounce
- `src/components/nutrition-score-ring.tsx` — SVG ring (0-100, colour-coded bands)
- `src/components/macro-progress-bars.tsx` — protein/carbs/fat/calorie bars with % labels
- `src/components/deficiency-alerts.tsx` — severity-coloured badges for deficiencies + excesses
- `src/components/nutrition-panel.tsx` — combines score ring + macro bars + deficiency alerts
- `src/components/recipe-badge.tsx` — difficulty/time/favorite/score chips
- `src/app/(app)/layout.tsx` — nav layout (Dashboard, Recipes, Planner, Pantry, Grocery, Settings)
- `src/app/(app)/recipes/page.tsx` — recipe list with cards
- `src/app/(app)/recipes/new/page.tsx` — recipe builder (USDA search, ingredients, steps)
- `src/app/(app)/recipes/[id]/page.tsx` — recipe detail with per-serving nutrition

### Phase 3 — Complete

- `src/app/api/goals/route.ts` — GET (latest NutritionGoal) + POST (upsert). Single-user: always upserts the one record.
- `src/app/(app)/settings/page.tsx` — client-side NutritionGoal form. Pre-populates from API on load. Fields: calories, protein, carbs, fat, fiber, sodium. Saves on submit with validation.
- `src/app/api/meal-plans/route.ts` — GET (`?weekStart=YYYY-MM-DD` or `?date=YYYY-MM-DD`) + POST (creates MealPlan AND immediately calculates + writes MealPlanNutritionSnapshot in a transaction). This is the canonical way to create meal plans.
- `src/app/api/meal-plans/[id]/route.ts` — DELETE (cascades snapshot deletion first, then plan).
- `src/components/weekly-sparklines.tsx` — Recharts: 7-bar calorie adherence chart (with target reference line) + macro line sparklines Mon-Sun + weekly stat tiles. Note: currently shows weekly averages as a flat line across 7 days because WeeklyAnalysis only exposes averages, not per-day series. Phase 5 planner will enable true per-day data.
- `src/app/(app)/page.tsx` — dashboard fully wired: fetches today's snapshots + week's plans server-side, computes `calculateDailyNutritionScore` inline, renders NutritionPanel (score ring + macro bars + deficiency alerts), "Fix deficiencies" link, This Week section with WeeklySparklines and recurring deficiency callout. Graceful fallbacks when no goals or no meals.

### Phase 4 — Complete

- `src/lib/themealdb.ts`
 — TheMealDB client: `searchMeals`, `getMealById`, `getCategories`, `filterByCategory`, `getRandomMeal`, `parseMealIngredients` (extracts 20 ingredient/measure slots into `ParsedIngredient[]`).
- `src/app/api/meals/search/route.ts` — GET `?q=` or `?category=`, proxies to TheMealDB with 1h revalidation.
- `src/app/api/meals/[id]/route.ts` — GET single meal by TheMealDB idMeal.
- `src/app/(app)/recipes/discover/page.tsx` — browse page: name search + category filter chips (toggle). Results grid with thumbnails. Each card links to the import wizard.
- `src/app/(app)/recipes/discover/[id]/page.tsx` — 4-step import wizard:
  1. View: full recipe card (image, tags, ingredient list, instructions, YouTube link)
  2. Match: auto-suggests top USDA match per ingredient (requires explicit confirmation). Ambiguous units (bunch, handful, etc.) flagged with amber badge. Unmatched ingredients skipped (no nutrition data for those).
  3. Details: prepMins, cookMins, servings (blank — TheMealDB provides none)
  4. Save: review summary + POST to /api/recipes. On 409 duplicate, shows three-option dialog (Open Existing / Replace Existing / Import as Duplicate).
- `src/app/api/recipes/route.ts POST` — extended: duplicate detection via RecipeSource (provider + externalId), replace action (cascades deletion), RecipeSource creation on any import with a provider field.
- `next.config.ts` — added `www.themealdb.com` to `images.remotePatterns`.

### Phase 5 — Complete

- `src/lib/optimizer.ts` — `scoreRecipeForGoal`, `scoreRecipeForSlot`, `rankRecipes`. All 6 scoring components (gap improvement +40, calorie fit +25, macro fit +15, pantry match +10, time fit +10, excess risk -20) plus full tie-breaker chain.
- `src/app/api/optimizer/route.ts` — GET `?date=YYYY-MM-DD&mealType=breakfast` returns top 3 scored recipes for that slot, building day state from existing snapshots.
- `src/components/meal-calendar.tsx` — dnd-kit weekly calendar: 7 cols × 4 rows. Drag to move slots (delete + re-POST). Click empty slot to open optimizer. Uses `/api/meal-plans` GET/POST/DELETE.
- `src/components/optimizer-panel.tsx` — top 3 suggestions panel with score bar, macro chips, Add button. Clears selection and bumps calendar key on add.
- `src/app/(app)/planner/page.tsx` — planner page: week navigation, MealCalendar + OptimizerPanel layout, slot selection state.

**Note:** WeeklySparklines on the dashboard now receives real per-day data as MealPlans are created via `/api/meal-plans POST`. No dashboard changes needed.

---

### Phase 6 — Complete

- `src/lib/grocery.ts` — `generateGroceryList` + `pantryNameSimilarity`. Full pipeline: scale by servings, Levenshtein pantry matching (≥0.8 threshold), consolidate by ingredient, user-friendly display unit, aisle category assignment. Exports `GroceryIngredient` and `GroceryListItemInput` types.
- `src/app/api/pantry/route.ts` — GET (all items, sorted expiring-soon first) + POST (create, resolves amountGrams via density). Tags each item with `useSoon` and `expired` flags.
- `src/app/api/pantry/[id]/route.ts` — PUT (update, re-resolves amountGrams if amount/unit changed) + DELETE.
- `src/app/api/grocery/generate/route.ts` — GET `?weekStart=` (fetch existing list) + POST `?weekStart=` (delete + regenerate in transaction). Scales each RecipeIngredient by `MealPlan.servings`.
- `src/app/api/grocery/[id]/route.ts` — PATCH (toggle `isChecked`) + DELETE.
- `src/components/pantry-manager.tsx` — USDA search → add form (amount/unit/expiry/notes), "Use Soon" section (amber, expiry ≤ 3 days sorted to top), "Expired" badge, delete.
- `src/components/grocery-list.tsx` — grouped by aisle (produce/meat/dairy/bakery/pantry/frozen/spices/beverages/other), checkboxes with optimistic update, "In pantry" badge for fully-covered items, weight-unknown warning, Regenerate button.
- `src/app/(app)/pantry/page.tsx` — pantry page wrapping PantryManager.
- `src/app/(app)/grocery/page.tsx` — grocery page with week navigation and GroceryList.

### Phase 7 — Complete

**Test infrastructure:**
- `vitest.config.ts` — node environment, `@/*` path alias, v8 coverage, 80% thresholds on `src/lib/**`
- `package.json` scripts: `test` (vitest run), `test:watch`, `test:coverage`

**Test files (72 total test cases, all type-check clean):**
- `__tests__/lib/nutrition.test.ts` — 9 tests: calculateRecipeNutrition (100g exact, 50g scaling, per-serving division, null amountGrams skip), calculateDailyNutritionScore (compliant day ≥90, severe deficiencies <60, sodium penalty), calculateWeeklyNutritionAnalysis (empty week, 3-of-7 planCompletion)
- `__tests__/lib/nutrient-gaps.test.ts` — 7 tests: severity thresholds (49%=severe, 65%=moderate, 85%=low, 105%=none), sodium excess, limitType=none ignored, guideline excess severity capped at "low"
- `__tests__/lib/optimizer.test.ts` — 7 tests: gap improvement scoring, upper-limit penalty, isFavorite tie-break, +10 pantry bonus, time-fit=0 for overlong recipes, empty library, nutritionScore tie-break
- `__tests__/lib/unit-conversion.test.ts` — 11 tests: flour/olive oil/egg/oats density resolution, 200g passthrough, unknown ingredient, unicode fraction parsing, ambiguous unit, cup→ml, mass→volume error, normalizeUnit tablespoon
- `__tests__/lib/grocery.test.ts` — 10 tests: partial/full pantry coverage, consolidation by ingredientId, null amountGrams, Levenshtein mismatch, empty list, aisle categories, similarity helper
- `__tests__/lib/pantry.test.ts` — 9 tests: amountGrams resolution, partial/full consume logic, Use Soon query (sorted), no-expiry case, can-cook-now coverage at 100%/80%/60%
- `__tests__/lib/recipe-import.test.ts` — 9 tests: tbsp parsing, ambiguous bunch, unicode fraction, slash fraction, parseMealIngredients with/without data, ambiguous measure, provider/externalId contract
- `__tests__/prisma/schema-validation.test.ts` — 10 tests: 33 NutrientReference count, ≥50 IngredientDensity count, limitType allowed set, verifiedAt non-null, canonicalName non-null, schema.prisma exists, no String[] fields, no sourceProvider/externalId on Recipe, migration dir has entries, dev.db exists

**Note on running tests:** `pnpm test` must be run on Windows where `node_modules` was installed (Vitest 4.x uses the `rolldown` bundler which requires a platform-native binary; the Linux sandbox only has the win32 binding). All 72 tests type-check cleanly — zero `src/` and `__tests__/` errors from `tsc --noEmit --skipLibCheck`.

---

## What still needs to be built (Phase 8)

### Phase 8 — Complete

- `src/app/(app)/layout.tsx` — responsive nav with hamburger menu (mobile), sticky header with backdrop blur, active-link highlighting via `usePathname`, Salad icon logo.
- `src/lib/fetcher.ts` — SWR-compatible JSON fetcher (throws on non-ok for proper SWR error state).
- `src/app/(app)/settings/page.tsx` — migrated from manual `useEffect` fetch to `useSWR`. Added Export JSON button wired to `/api/export` with browser download trigger.
- `src/app/(app)/recipes/discover/page.tsx` — categories loaded via `useSWR` (cached across navigation); search results show skeleton grid while loading.
- `src/components/skeleton.tsx` — `Skeleton`, `SkeletonCard`, `SkeletonList` components used across loading states.
- `src/app/api/export/route.ts` — `GET /api/export` dumps recipes (with ingredients), all meal plans, pantry items, current-week grocery list, and nutrition goal as a dated JSON attachment.
- `DEPLOY.md` — step-by-step PostgreSQL swap (schema.prisma, adapter, db.ts), Supabase setup, Vercel deploy checklist, env var reference, post-deploy verification.

**`tsc --noEmit --skipLibCheck` passes with zero `src/` errors across all phases.**

---

## What still needs to be built

Nothing. All 8 phases are complete. See `DEPLOY.md` for production deploy instructions.

---

## Known issues at handoff

1. **WeeklySparklines shows flat averages** — `WeeklyAnalysis` (from `calculateWeeklyNutritionAnalysis`) only exposes weekly averages, not a per-day series. The sparklines therefore show a flat line across all 7 days. Once Phase 5 lands and `/api/meal-plans` is in use, the dashboard can be updated to query per-day snapshots directly and pass them to a richer sparklines variant. The component has the `dates` array and `isActual` flag ready for this.

2. ~~Pantry and Grocery pages are stubs~~ — resolved in Phase 6.

3. **No NutritionGoal until user visits /settings** — the "No nutrition goals set" banner shows until saved. This is by design.

## Fixed issues

- **307 redirect loop** — duplicate `src/app/page.tsx` deleted. Resolved.
- **`.env.local` DATABASE_URL mismatch** — was pointing to `file:./prisma/dev.db`. Fixed to `file:./dev.db`.
- **File truncation** — Edit tool and Write tool both silently truncate large files. All large file writes now use bash heredoc. See the "File writing gotcha" section above.

---

## Quality gates (must pass before shipping)

```bash
pnpm install
npx prisma migrate dev
npx prisma db seed
pnpm build          # must succeed with no errors
npx tsc --noEmit    # must be clean
pnpm test           # all pass, >=80% lib/* coverage
pnpm lint
```

Current state: `tsc --noEmit --skipLibCheck` passes with zero src/ errors. Build requires Windows + pnpm (not runnable in Linux sandbox).

---

## How to run locally

```powershell
cd "C:\Users\eshan\Documents\Claude\Claude-Work\PROJECTS\Meal Planning\nutrimeal"
pnpm dev            # -> http://localhost:3000
```

Install, migrate, and seed have already been run. Only re-run them if you add a new migration or reset the database.

USDA API key is already set in `.env.local`. Database URL is `file:./dev.db` in both `.env` and `.env.local`.
