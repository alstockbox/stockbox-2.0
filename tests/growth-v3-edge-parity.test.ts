import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allocateGrowthCandidates as allocateApp } from "@/lib/growth/explore-exploit";
import { buildGrowthStoryboard as storyboardApp } from "@/lib/growth/storyboard";
import { evaluateBudget as budgetApp, chooseDailyVideoCapacity as capacityApp } from "@/lib/growth/budget-governor";
import { allocateGrowthCandidates as allocateEdge } from "../supabase/functions/stockbox-growth-engine/v3/explore-exploit";
import { buildGrowthStoryboard as storyboardEdge } from "../supabase/functions/stockbox-growth-engine/v3/storyboard";
import { evaluateBudget as budgetEdge, chooseDailyVideoCapacity as capacityEdge } from "../supabase/functions/stockbox-growth-engine/v3/budget";

function fixture(name: string) {
  return JSON.parse(readFileSync(new URL(`./fixtures/growth-v3/${name}.json`, import.meta.url), "utf8"));
}

describe("growth v3 app/Edge policy parity", () => {
  it("keeps allocation JSON shape and result identical", () => {
    const data = fixture("allocation");
    const app = allocateApp(data.candidates, data.slots, data.ratios, data.seed);
    const edge = allocateEdge(data.candidates, data.slots, data.ratios, data.seed);
    expect(edge).toEqual(app);
    expect(app.map((pick) => ({ candidateId: pick.candidateId, bucket: pick.bucket }))).toEqual(data.expected);
  });

  it("keeps storyboard JSON identical and matches stored scene timing", () => {
    const data = fixture("storyboard");
    const app = storyboardApp(data.input);
    const edge = storyboardEdge(data.input);
    expect(edge).toEqual(app);
    expect(app.scenes.map(({ id, kind, startMs, endMs }) => ({ id, kind, startMs, endMs }))).toEqual(data.expectedScenes);
  });

  it("keeps budget decisions identical", () => {
    for (const input of [
      { monthlySpendSek: 10, projectedCostSek: 1, optional: false },
      { monthlySpendSek: 45, projectedCostSek: 2, optional: true },
      { monthlySpendSek: 74.5, projectedCostSek: 1, optional: false },
      { monthlySpendSek: 10, projectedCostSek: null, optional: true },
    ]) {
      expect(budgetEdge(input)).toEqual(budgetApp(input));
    }
    expect(capacityEdge({ monthlySpendSek: 46, qualityCandidates: 3 })).toBe(capacityApp({ monthlySpendSek: 46, qualityCandidates: 3 }));
  });
});
