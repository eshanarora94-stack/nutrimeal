/**
 * schema-validation.test.ts
 *
 * Tests against the live dev.db (seeded) and Prisma schema.
 * Requires DATABASE_URL to resolve to dev.db.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import fs from "fs";

// ── Client ────────────────────────────────────────────────────────────────────

const DB_PATH = path.resolve(__dirname, "../../dev.db");
let prisma: PrismaClient;

beforeAll(() => {
  const adapter = new PrismaBetterSqlite3({ url: DB_PATH });
  prisma = new PrismaClient({ adapter } as never);
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("schema-validation — seed counts", () => {
  it("seed produces exactly 33 NutrientReference records", async () => {
    const count = await prisma.nutrientReference.count();
    expect(count).toBe(33);
  });

  it("seed produces ≥ 50 IngredientDensity records", async () => {
    const count = await prisma.ingredientDensity.count();
    expect(count).toBeGreaterThanOrEqual(50);
  });
});

describe("schema-validation — NutrientReference field constraints", () => {
  it("every NutrientReference has non-null limitType from allowed set", async () => {
    const refs = await prisma.nutrientReference.findMany({ select: { limitType: true } });
    const allowed = new Set(["target", "upper_limit", "guideline", "none"]);
    for (const ref of refs) {
      expect(ref.limitType).not.toBeNull();
      expect(allowed.has(ref.limitType)).toBe(true);
    }
  });

  it("every NutrientReference has non-null verifiedAt (Gate 1 passed)", async () => {
    const refs = await prisma.nutrientReference.findMany({ select: { verifiedAt: true, canonicalName: true } });
    for (const ref of refs) {
      expect(ref.verifiedAt).not.toBeNull();
    }
  });

  it("every NutrientReference has non-null canonicalName", async () => {
    const refs = await prisma.nutrientReference.findMany({ select: { canonicalName: true } });
    for (const ref of refs) {
      expect(ref.canonicalName).toBeTruthy();
    }
  });
});

describe("schema-validation — schema.prisma file checks", () => {
  const schemaPath = path.resolve(__dirname, "../../prisma/schema.prisma");
  let schema: string;

  beforeAll(() => {
    schema = fs.readFileSync(schemaPath, "utf8");
  });

  it("schema.prisma exists and is non-empty", () => {
    expect(schema.length).toBeGreaterThan(100);
  });

  it("no model uses String[] field type — tags is Json?", () => {
    // String[] arrays aren't supported in SQLite — all arrays must be Json?
    const hasStringArray = /^\s+\w+\s+String\[\]/m.test(schema);
    expect(hasStringArray).toBe(false);
  });

  it("Recipe model has no sourceProvider or externalId fields (those live on RecipeSource)", () => {
    const recipeBlock = schema.match(/model Recipe \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(recipeBlock).not.toContain("sourceProvider");
    expect(recipeBlock).not.toContain("externalId");
  });
});

describe("schema-validation — migration state", () => {
  it("migrations directory has at least one migration folder", () => {
    const migrationsDir = path.resolve(__dirname, "../../prisma/migrations");
    const entries = fs.readdirSync(migrationsDir).filter(
      (e) => fs.statSync(path.join(migrationsDir, e)).isDirectory()
    );
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it("dev.db exists (migration has been applied)", () => {
    expect(fs.existsSync(DB_PATH)).toBe(true);
  });
});
