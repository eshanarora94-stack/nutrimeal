import { describe, it, expect } from "vitest";
import { detectNutrientGaps, type DayNutrition } from "@/lib/nutrition";
import type { NutritionGoal, NutrientReference } from "@prisma/client";

function makeRef(overrides: Partial<NutrientReference>): NutrientReference {
  return {
    id: "ref-1",
    nutrientId: "n1",
    nutrientNumber: "203",
    nutrientName: "Protein",
    canonicalName: "Protein",
    aliases: null,
    unitName: "g",
    defaultTarget: 50,
    defaultUpperLimit: null,
    limitType: "target",
    category: "macro",
    source: "FDA",
    sourceDatasetVersion: null,
    verifiedAt: new Date(),
    notes: null,
    ...overrides,
  };
}

function makeGoals(): NutritionGoal {
  return {
    id: "g1", calories: 2000, proteinG: 50, carbsG: 250, fatG: 65,
    fiberG: 28, sodiumMg: 2300, customGoals: null, updatedAt: new Date(),
  };
}

function dayWith(nutrientId: string, amount: number): DayNutrition {
  return {
    date: "2026-01-01",
    nutrients: [{ nutrientId, nutrientName: "Protein", amount, unitName: "g" }],
    macros: { calories: 2000, proteinG: amount, carbsG: 250, fatG: 65, fiberG: 28 },
  };
}

describe("detectNutrientGaps", () => {
  it("49% of target → severity = 'severe'", () => {
    const ref = makeRef({ defaultTarget: 50 });
    const day = dayWith("n1", 24.5); // 49%
    const { deficiencies } = detectNutrientGaps(day, makeGoals(), [ref]);
    expect(deficiencies[0]?.severity).toBe("severe");
  });

  it("65% of target → severity = 'moderate'", () => {
    const ref = makeRef({ defaultTarget: 50 });
    const day = dayWith("n1", 32.5); // 65%
    const { deficiencies } = detectNutrientGaps(day, makeGoals(), [ref]);
    expect(deficiencies[0]?.severity).toBe("moderate");
  });

  it("85% of target → severity = 'low'", () => {
    const ref = makeRef({ defaultTarget: 50 });
    const day = dayWith("n1", 42.5); // 85%
    const { deficiencies } = detectNutrientGaps(day, makeGoals(), [ref]);
    expect(deficiencies[0]?.severity).toBe("low");
  });

  it("105% of target → not in deficiencies", () => {
    const ref = makeRef({ defaultTarget: 50 });
    const day = dayWith("n1", 52.5); // 105%
    const { deficiencies } = detectNutrientGaps(day, makeGoals(), [ref]);
    expect(deficiencies).toHaveLength(0);
  });

  it("sodium at 110% of limit → appears in excesses, not deficiencies", () => {
    const sodiumRef = makeRef({
      nutrientId: "sodium-id",
      nutrientName: "Sodium",
      canonicalName: "Sodium",
      unitName: "mg",
      defaultTarget: null,
      defaultUpperLimit: 2300,
      limitType: "upper_limit",
    });
    const day: DayNutrition = {
      date: "2026-01-01",
      nutrients: [{ nutrientId: "sodium-id", nutrientName: "Sodium", amount: 2530, unitName: "mg" }],
      macros: { calories: 2000, proteinG: 50, carbsG: 250, fatG: 65, fiberG: 28 },
    };
    const { deficiencies, excesses } = detectNutrientGaps(day, makeGoals(), [sodiumRef]);
    expect(deficiencies).toHaveLength(0);
    expect(excesses).toHaveLength(1);
    expect(excesses[0].nutrientId).toBe("sodium-id");
  });

  it("limitType = 'none' → never flagged", () => {
    const ref = makeRef({ limitType: "none" });
    const day = dayWith("n1", 0); // completely missing
    const { deficiencies, excesses } = detectNutrientGaps(day, makeGoals(), [ref]);
    expect(deficiencies).toHaveLength(0);
    expect(excesses).toHaveLength(0);
  });

  it("limitType = 'guideline' excess → detected, severity capped at 'low'", () => {
    const ref = makeRef({
      limitType: "guideline",
      defaultTarget: null,
      defaultUpperLimit: 20,
    });
    const day = dayWith("n1", 25); // 125% — excess
    const { excesses } = detectNutrientGaps(day, makeGoals(), [ref]);
    expect(excesses).toHaveLength(1);
    expect(excesses[0].severity).toBe("low");
  });
});
