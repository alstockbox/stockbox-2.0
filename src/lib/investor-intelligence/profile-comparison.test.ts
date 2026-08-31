import { describe, expect, it } from "vitest";
import { buildProfileScoreComparison } from "./profile-comparison";

describe("buildProfileScoreComparison",()=>{
  it("uses existing StockBox profile weights and shows differentiated drivers",()=>{
    const result=buildProfileScoreComparison({sector:"technology",dimensions:{growth:95,profitability:80,financialHealth:65,valuation:45,cashFlow:80,earningsQuality:75,quality:90,momentum:70,risk:70}});
    const growth=result.find((row)=>row.profile==="growth");
    const value=result.find((row)=>row.profile==="value");
    expect(growth?.score).not.toBe(value?.score);
    expect(growth?.topWeights[0]?.key).toBe("growth");
    expect(value?.topWeights[0]?.key).toBe("valuation");
  });
});
