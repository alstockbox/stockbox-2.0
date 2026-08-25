import { describe, expect, it } from "vitest";
import { classifyCompany } from "../../src/lib/analysis/archetypes";

describe("company archetype classification", () => {
  it("classifies automotive manufacturers as cyclical rather than unknown", () => {
    expect(classifyCompany({
      sic: "3711",
      sicDescription: "Motor Vehicles & Passenger Car Bodies",
      name: "Tesla, Inc.",
    })).toEqual(expect.objectContaining({
      sector: "industrials",
      analysisArchetype: "cyclical",
    }));
  });
});