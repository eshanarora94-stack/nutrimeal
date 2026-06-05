# NutriMeal — Production Deploy Guide

## Prerequisites

- Supabase project created (free tier is fine)
- Vercel account connected to your GitHub repo
- `pnpm` available locally

---

## 1 — PostgreSQL swap (local or CI)

**`prisma/schema.prisma`** — change the datasource provider:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
}
```

**`package.json`** — swap the adapter:

```bash
pnpm remove @prisma/adapter-better-sqlite3 better-sqlite3 @types/better-sqlite3
pnpm add @prisma/adapter-pg pg
pnpm add -D @types/pg
```

**`src/lib/db.ts`** — swap the import and adapter:

```ts
// Replace:
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
const adapter = new PrismaBetterSqlite3({ url: resolvedPath });

// With:
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
```

**`prisma.config.ts`** — no changes needed; it already reads `DATABASE_URL` from env.

---

## 2 — Supabase setup

1. Create project at [supabase.com](https://supabase.com)
2. **Settings → Database → Connection string (URI)** — copy the `postgres://...` string
3. Set it as `DATABASE_URL` in your local `.env.local` (for testing the PG swap locally)
4. Run migrations and seed:

```bash
npx prisma migrate deploy
npx prisma db seed
```

Verify: `SELECT COUNT(*) FROM "NutrientReference"` should return `33`.

---

## 3 — Vercel deploy

1. Push your repo to GitHub
2. Import project at [vercel.com/new](https://vercel.com/new)
3. **Environment Variables** — add:
   - `DATABASE_URL` → Supabase connection string (use the **pooler** URL for serverless)
   - `USDA_API_KEY` → your USDA FoodData Central API key
4. Deploy
5. After first deploy, run seed via Vercel CLI or a one-off function:

```bash
vercel env pull .env.local
npx prisma migrate deploy
npx prisma db seed
```

6. Verify on the deployed URL: `/api/export` should return JSON with `nutritionGoal: null` and empty arrays if fresh.

---

## 4 — Environment variable reference

| Variable | Where | Description |
|---|---|---|
| `DATABASE_URL` | `.env` + Vercel | SQLite: `file:./dev.db` · PostgreSQL: `postgres://...` |
| `USDA_API_KEY` | `.env.local` + Vercel | Free key from fdc.nal.usda.gov/api-key-signup |

---

## 5 — Post-deploy checklist

- [ ] 33 `NutrientReference` records present
- [ ] ≥50 `IngredientDensity` records present
- [ ] `/api/foods/search?q=chicken` returns results (USDA key working)
- [ ] Recipe creation round-trip works
- [ ] Dashboard loads without error
