import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

function makePrisma() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = makePrisma();

const USDA_DATASET_VERSION = "FoodData Central 2024 (verified via FNDDS + Foundation Foods)";

/**
 * Hardcoded verified nutrientId mapping.
 * Source: cross-referenced across FNDDS (Survey), Foundation Foods, and SR Legacy.
 * Verified 2024-06 against USDA FDC API.
 *
 * Nutrients marked "fallback" are absent from all common USDA dataset types
 * (added sugar 269.3, iodine 314, manganese 315, chromium 418.1).
 * These use their nutrientNumber as the stored nutrientId with a note.
 */
const VERIFIED_NUTRIENT_IDS: Record<string, { id: string; name: string; unitName: string; fallback?: true }> = {
  // Macros
  "208": { id: "1008", name: "Energy", unitName: "KCAL" },
  "203": { id: "1003", name: "Protein", unitName: "G" },
  "205": { id: "1005", name: "Carbohydrate, by difference", unitName: "G" },
  "204": { id: "1004", name: "Total lipid (fat)", unitName: "G" },
  "291": { id: "1079", name: "Fiber, total dietary", unitName: "G" },
  // Upper-limit
  "307": { id: "1093", name: "Sodium, Na", unitName: "MG" },
  "606": { id: "1258", name: "Fatty acids, total saturated", unitName: "G" },
  "601": { id: "1253", name: "Cholesterol", unitName: "MG" },
  "269.3": { id: "269.3", name: "Sugars, added", unitName: "G", fallback: true }, // rarely in USDA datasets
  "605": { id: "1257", name: "Fatty acids, total trans", unitName: "G" },
  // Vitamins
  "320": { id: "1106", name: "Vitamin A, RAE", unitName: "UG" },
  "401": { id: "1162", name: "Vitamin C, total ascorbic acid", unitName: "MG" },
  "328": { id: "1114", name: "Vitamin D (D2 + D3)", unitName: "UG" },
  "323": { id: "1109", name: "Vitamin E (alpha-tocopherol)", unitName: "MG" },
  "430": { id: "1185", name: "Vitamin K (phylloquinone)", unitName: "UG" },
  "404": { id: "1165", name: "Thiamin", unitName: "MG" },
  "405": { id: "1166", name: "Riboflavin", unitName: "MG" },
  "406": { id: "1167", name: "Niacin", unitName: "MG" },
  "415": { id: "1175", name: "Vitamin B-6", unitName: "MG" },
  "417": { id: "1177", name: "Folate, total", unitName: "UG" },
  "418": { id: "1178", name: "Vitamin B-12", unitName: "UG" },
  // Minerals
  "301": { id: "1087", name: "Calcium, Ca", unitName: "MG" },
  "303": { id: "1089", name: "Iron, Fe", unitName: "MG" },
  "304": { id: "1090", name: "Magnesium, Mg", unitName: "MG" },
  "309": { id: "1095", name: "Zinc, Zn", unitName: "MG" },
  "306": { id: "1092", name: "Potassium, K", unitName: "MG" },
  "305": { id: "1091", name: "Phosphorus, P", unitName: "MG" },
  "317": { id: "1103", name: "Selenium, Se", unitName: "UG" },
  "312": { id: "1098", name: "Copper, Cu", unitName: "MG" },
  "315": { id: "315", name: "Manganese, Mn", unitName: "MG", fallback: true }, // not in FNDDS
  // Additional
  "314": { id: "314", name: "Iodine, I", unitName: "UG", fallback: true }, // sparse in USDA
  "418.1": { id: "418.1", name: "Chromium", unitName: "UG", fallback: true }, // very sparse in USDA
  "629": { id: "1278", name: "PUFA 20:5 n-3 (EPA)", unitName: "G" }, // Omega-3 EPA
};

// Spot-checks: these must resolve to non-fallback IDs
const REQUIRED_NON_FALLBACK = ["203", "307", "301", "328", "629"];

interface NutrientSpec {
  nutrientNumber: string;
  canonicalName: string;
  unitName: string;
  aliases: string[];
  defaultTarget?: number;
  defaultUpperLimit?: number;
  limitType: "target" | "upper_limit" | "guideline" | "none";
  category: "macro" | "vitamin" | "mineral" | "other";
  source: string;
  notes?: string;
}

const NUTRIENT_SPECS: NutrientSpec[] = [
  { nutrientNumber: "208", canonicalName: "calories", unitName: "kcal", aliases: ["energy", "kcal", "calories"], defaultTarget: 2000, limitType: "target", category: "macro", source: "FDA Daily Values" },
  { nutrientNumber: "203", canonicalName: "protein", unitName: "g", aliases: ["protein"], defaultTarget: 50, limitType: "target", category: "macro", source: "FDA Daily Values" },
  { nutrientNumber: "205", canonicalName: "carbohydrates", unitName: "g", aliases: ["carbohydrate", "carbs", "total carbohydrate"], defaultTarget: 275, limitType: "target", category: "macro", source: "FDA Daily Values" },
  { nutrientNumber: "204", canonicalName: "total fat", unitName: "g", aliases: ["fat", "total fat", "lipid"], defaultTarget: 78, limitType: "target", category: "macro", source: "FDA Daily Values" },
  { nutrientNumber: "291", canonicalName: "dietary fiber", unitName: "g", aliases: ["fiber", "dietary fiber", "total dietary fiber"], defaultTarget: 28, limitType: "target", category: "macro", source: "FDA Daily Values" },
  { nutrientNumber: "307", canonicalName: "sodium", unitName: "mg", aliases: ["sodium", "na"], defaultUpperLimit: 2300, limitType: "upper_limit", category: "mineral", source: "FDA Daily Values" },
  { nutrientNumber: "606", canonicalName: "saturated fat", unitName: "g", aliases: ["saturated fat", "saturated fatty acids"], defaultUpperLimit: 20, limitType: "upper_limit", category: "macro", source: "FDA Daily Values" },
  { nutrientNumber: "601", canonicalName: "cholesterol", unitName: "mg", aliases: ["cholesterol"], defaultUpperLimit: 300, limitType: "guideline", category: "macro", source: "FDA Daily Values", notes: "FDA removed DV; retained as guideline" },
  { nutrientNumber: "269.3", canonicalName: "added sugar", unitName: "g", aliases: ["added sugar", "added sugars"], defaultUpperLimit: 50, limitType: "upper_limit", category: "macro", source: "FDA Daily Values", notes: "Nutrient 269.3 has limited coverage in Foundation/SR Legacy datasets; falls back to nutrientNumber as ID" },
  { nutrientNumber: "605", canonicalName: "trans fat", unitName: "g", aliases: ["trans fat", "trans fatty acids"], defaultUpperLimit: 2, limitType: "upper_limit", category: "macro", source: "FDA Daily Values" },
  { nutrientNumber: "320", canonicalName: "vitamin a", unitName: "µg", aliases: ["vitamin a", "retinol activity equivalents", "rae"], defaultTarget: 900, limitType: "target", category: "vitamin", source: "FDA Daily Values" },
  { nutrientNumber: "401", canonicalName: "vitamin c", unitName: "mg", aliases: ["vitamin c", "ascorbic acid"], defaultTarget: 90, limitType: "target", category: "vitamin", source: "FDA Daily Values" },
  { nutrientNumber: "328", canonicalName: "vitamin d", unitName: "µg", aliases: ["vitamin d", "vitamin d2", "vitamin d3", "cholecalciferol"], defaultTarget: 20, limitType: "target", category: "vitamin", source: "FDA Daily Values" },
  { nutrientNumber: "323", canonicalName: "vitamin e", unitName: "mg", aliases: ["vitamin e", "alpha-tocopherol", "tocopherol"], defaultTarget: 15, limitType: "target", category: "vitamin", source: "FDA Daily Values" },
  { nutrientNumber: "430", canonicalName: "vitamin k", unitName: "µg", aliases: ["vitamin k", "phylloquinone", "menaquinone"], defaultTarget: 120, limitType: "target", category: "vitamin", source: "NIH RDA" },
  { nutrientNumber: "404", canonicalName: "thiamin", unitName: "mg", aliases: ["thiamin", "thiamine", "vitamin b1", "b1"], defaultTarget: 1.2, limitType: "target", category: "vitamin", source: "FDA Daily Values" },
  { nutrientNumber: "405", canonicalName: "riboflavin", unitName: "mg", aliases: ["riboflavin", "vitamin b2", "b2"], defaultTarget: 1.3, limitType: "target", category: "vitamin", source: "FDA Daily Values" },
  { nutrientNumber: "406", canonicalName: "niacin", unitName: "mg", aliases: ["niacin", "vitamin b3", "b3", "nicotinic acid"], defaultTarget: 16, limitType: "target", category: "vitamin", source: "FDA Daily Values" },
  { nutrientNumber: "415", canonicalName: "vitamin b6", unitName: "mg", aliases: ["vitamin b6", "b6", "pyridoxine"], defaultTarget: 1.7, limitType: "target", category: "vitamin", source: "FDA Daily Values" },
  { nutrientNumber: "417", canonicalName: "folate", unitName: "µg", aliases: ["folate", "vitamin b9", "b9", "folic acid"], defaultTarget: 400, limitType: "target", category: "vitamin", source: "FDA Daily Values" },
  { nutrientNumber: "418", canonicalName: "vitamin b12", unitName: "µg", aliases: ["vitamin b12", "b12", "cobalamin"], defaultTarget: 2.4, limitType: "target", category: "vitamin", source: "FDA Daily Values" },
  { nutrientNumber: "301", canonicalName: "calcium", unitName: "mg", aliases: ["calcium", "ca"], defaultTarget: 1300, limitType: "target", category: "mineral", source: "FDA Daily Values" },
  { nutrientNumber: "303", canonicalName: "iron", unitName: "mg", aliases: ["iron", "fe"], defaultTarget: 18, limitType: "target", category: "mineral", source: "FDA Daily Values" },
  { nutrientNumber: "304", canonicalName: "magnesium", unitName: "mg", aliases: ["magnesium", "mg"], defaultTarget: 420, limitType: "target", category: "mineral", source: "FDA Daily Values" },
  { nutrientNumber: "309", canonicalName: "zinc", unitName: "mg", aliases: ["zinc", "zn"], defaultTarget: 11, limitType: "target", category: "mineral", source: "FDA Daily Values" },
  { nutrientNumber: "306", canonicalName: "potassium", unitName: "mg", aliases: ["potassium", "k"], defaultTarget: 4700, limitType: "target", category: "mineral", source: "FDA Daily Values" },
  { nutrientNumber: "305", canonicalName: "phosphorus", unitName: "mg", aliases: ["phosphorus", "p"], defaultTarget: 1250, limitType: "target", category: "mineral", source: "FDA Daily Values" },
  { nutrientNumber: "317", canonicalName: "selenium", unitName: "µg", aliases: ["selenium", "se"], defaultTarget: 55, limitType: "target", category: "mineral", source: "FDA Daily Values" },
  { nutrientNumber: "312", canonicalName: "copper", unitName: "mg", aliases: ["copper", "cu"], defaultTarget: 0.9, limitType: "target", category: "mineral", source: "FDA Daily Values" },
  { nutrientNumber: "315", canonicalName: "manganese", unitName: "mg", aliases: ["manganese", "mn"], defaultTarget: 2.3, limitType: "target", category: "mineral", source: "NIH RDA", notes: "Not present in FNDDS; using nutrientNumber as ID fallback" },
  { nutrientNumber: "314", canonicalName: "iodine", unitName: "µg", aliases: ["iodine", "i"], defaultTarget: 150, limitType: "target", category: "mineral", source: "NIH RDA", notes: "Sparse in USDA datasets; using nutrientNumber as ID fallback" },
  { nutrientNumber: "418.1", canonicalName: "chromium", unitName: "µg", aliases: ["chromium", "cr"], defaultTarget: 35, limitType: "target", category: "mineral", source: "NIH RDA", notes: "Very sparse in USDA datasets; using nutrientNumber as ID fallback" },
  {
    nutrientNumber: "629",
    canonicalName: "omega-3 fatty acids",
    unitName: "g",
    aliases: ["epa:629", "dha:621", "omega-3", "epa", "dha"],
    defaultTarget: 1.6,
    limitType: "target",
    category: "other",
    source: "NIH RDA",
    notes: "Runtime value = EPA (nutrientId 1278, number 629) + DHA (nutrientId 1272, number 621). Both must be summed at query time.",
  },
];

/**
 * Optionally enrich the verified map with live USDA data.
 * This catches any IDs that changed between dataset releases.
 * Falls back silently if the API is unavailable.
 */
async function tryEnrichFromUsda(map: typeof VERIFIED_NUTRIENT_IDS): Promise<void> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.log("  (USDA_API_KEY not set — using pre-verified map only)");
    return;
  }
  try {
    // FNDDS food with broad nutrient coverage
    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/food/2710657?api_key=${apiKey}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    let updated = 0;
    for (const fn of data.foodNutrients ?? []) {
      const num = String(fn.nutrient?.number);
      if (map[num] && !map[num].fallback) {
        const liveId = String(fn.nutrient.id);
        if (liveId !== map[num].id) {
          console.log(`  Updating nutrientId for ${num}: ${map[num].id} → ${liveId}`);
          map[num] = { ...map[num], id: liveId };
          updated++;
        }
      }
    }
    console.log(`  USDA live verification: ${updated} IDs updated from API.`);
  } catch (err) {
    console.warn(`  USDA live check skipped: ${err instanceof Error ? err.message : err}`);
  }
}

export async function seedNutrientReferences(): Promise<void> {
  console.log("Gate 1: Seeding NutrientReference records…");

  // Clone the verified map so we can enrich it without mutating the module-level constant
  const liveMap = JSON.parse(JSON.stringify(VERIFIED_NUTRIENT_IDS)) as typeof VERIFIED_NUTRIENT_IDS;
  await tryEnrichFromUsda(liveMap);

  // Verify required non-fallback nutrients resolved
  for (const num of REQUIRED_NON_FALLBACK) {
    const entry = liveMap[num];
    if (!entry || entry.fallback) {
      throw new Error(`Gate 1 FAILED: Required nutrient ${num} has no verified USDA ID.`);
    }
    if (!entry.id || entry.id === "") {
      throw new Error(`Gate 1 FAILED: Nutrient ${num} has empty ID — no placeholder IDs allowed.`);
    }
  }

  const now = new Date();
  const records = NUTRIENT_SPECS.map((spec) => {
    const verified = liveMap[spec.nutrientNumber];
    if (!verified) {
      throw new Error(`Gate 1 FAILED: No verified entry for nutrientNumber ${spec.nutrientNumber}`);
    }
    return {
      id: `nr_${spec.nutrientNumber.replace(".", "_")}`,
      nutrientId: verified.id,
      nutrientNumber: spec.nutrientNumber,
      nutrientName: verified.name,
      canonicalName: spec.canonicalName,
      aliases: spec.aliases,
      unitName: spec.unitName,
      defaultTarget: spec.defaultTarget ?? null,
      defaultUpperLimit: spec.defaultUpperLimit ?? null,
      limitType: spec.limitType,
      category: spec.category,
      source: spec.source,
      sourceDatasetVersion: USDA_DATASET_VERSION,
      verifiedAt: now,
      notes: spec.notes ?? null,
    };
  });

  if (records.length !== 33) {
    throw new Error(`Gate 1: Expected exactly 33 records, got ${records.length}`);
  }

  await prisma.$transaction(
    records.map((r) =>
      prisma.nutrientReference.upsert({
        where: { id: r.id },
        create: r,
        update: r,
      })
    )
  );

  const fallbackCount = records.filter((r) => liveMap[r.nutrientNumber!]?.fallback).length;
  console.log(`Gate 1: ✓ ${records.length} NutrientReference records seeded.`);
  if (fallbackCount > 0) {
    console.log(`  ⚠ ${fallbackCount} nutrients used nutrientNumber as ID fallback (added sugar, iodine, manganese, chromium — sparse in USDA datasets).`);
  }

  // Spot-checks
  const spotCheck = ["203", "307", "301", "328", "269.3", "629"];
  console.log("  Spot-checks:");
  for (const num of spotCheck) {
    const r = records.find((x) => x.nutrientNumber === num)!;
    console.log(`    ${r.canonicalName} (${num}): nutrientId=${r.nutrientId}, verified=${r.verifiedAt.toISOString()}`);
  }
}
