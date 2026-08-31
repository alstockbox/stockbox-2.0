import { describe, expect, it } from "vitest";
import { rankPeerCandidates } from "./peers";

describe("rankPeerCandidates", () => {
  it("prefers same sector, archetype and similar market cap", () => {
    const target = { ticker: "AAA", sector: "technology", archetype: "software_growth", marketCap: 100 };
    const candidates = [
      { ticker: "BBB", sector: "technology", archetype: "software_growth", marketCap: 110 },
      { ticker: "CCC", sector: "technology", archetype: "software_growth", marketCap: 900 },
      { ticker: "DDD", sector: "financials", archetype: "software_growth", marketCap: 100 },
      { ticker: "EEE", sector: "technology", archetype: "standard", marketCap: 90 },
    ];
    const ranked = rankPeerCandidates(target, candidates);
    expect(ranked[0]?.ticker).toBe("BBB");
    expect(ranked.find((item) => item.ticker === "DDD")?.score).toBeLessThan(ranked[0]?.score ?? 0);
  });
});
