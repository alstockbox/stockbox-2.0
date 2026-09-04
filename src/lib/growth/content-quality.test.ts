import { describe, expect, it } from "vitest";
import {
  isTransientAiStatus,
  scoreStockboxTopic,
  selectDailyContent,
  type DailyCandidate,
} from "./content-quality";

describe("scoreStockboxTopic", () => {
  it("rejects clearly off-topic private-finance news", () => {
    const result = scoreStockboxTopic({
      topic: "Kan förskott på arv gynna mina barn skattemässigt?",
      type: "news",
    });
    expect(result.eligible).toBe(false);
    expect(result.score).toBeLessThan(60);
    expect(result.flags).toContain("off_topic_private_finance");
  });

  it("accepts StockBox-relevant evergreen analysis topics", () => {
    const result = scoreStockboxTopic({
      topic: "hur analyserar man skuldsättning i ett bolag",
      type: "evergreen",
    });
    expect(result.eligible).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(72);
  });

  it("requires stronger evidence for generic news without company or ticker", () => {
    const result = scoreStockboxTopic({
      topic: "Rapport: Farliga batterier dumpas i fattiga länder",
      type: "news",
    });
    expect(result.eligible).toBe(false);
  });
});

describe("selectDailyContent", () => {
  it("keeps a small high-quality shortlist and spreads it across platforms", () => {
    const candidates: DailyCandidate[] = [
      { id: "a1", platform: "tiktok", contentId: "a", qualityScore: 96 },
      { id: "a2", platform: "instagram_reel", contentId: "a", qualityScore: 95 },
      { id: "b1", platform: "linkedin", contentId: "b", qualityScore: 94 },
      { id: "c1", platform: "facebook", contentId: "c", qualityScore: 93 },
      { id: "d1", platform: "youtube_short", contentId: "d", qualityScore: 92 },
      { id: "e1", platform: "instagram_carousel", contentId: "e", qualityScore: 91 },
      { id: "f1", platform: "tiktok", contentId: "f", qualityScore: 90 },
      { id: "g1", platform: "tiktok", contentId: "g", qualityScore: 40 },
    ];

    const selected = selectDailyContent(candidates, { limit: 6, minQuality: 72 });
    expect(selected).toHaveLength(6);
    expect(new Set(selected.map((item) => item.platform)).size).toBe(6);
    expect(selected.every((item) => item.qualityScore >= 72)).toBe(true);
  });
});

describe("isTransientAiStatus", () => {
  it("retries temporary provider failures but not ordinary client errors", () => {
    expect(isTransientAiStatus(429)).toBe(true);
    expect(isTransientAiStatus(503)).toBe(true);
    expect(isTransientAiStatus(400)).toBe(false);
    expect(isTransientAiStatus(404)).toBe(false);
  });
});
