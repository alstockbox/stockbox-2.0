import { describe, expect, it } from "vitest";
import {
  isTransientAiStatus,
  planDailyQueue,
  scoreStockboxTopic,
  selectDailyContent,
  type DailyCandidate,
} from "../src/lib/growth/content-quality";

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

  it("does not let one topic dominate the day when another strong topic is available", () => {
    const candidates: DailyCandidate[] = [
      { id: "a1", platform: "tiktok", contentId: "a", qualityScore: 100 },
      { id: "a2", platform: "instagram_reel", contentId: "a", qualityScore: 100 },
      { id: "a3", platform: "instagram_carousel", contentId: "a", qualityScore: 100 },
      { id: "a4", platform: "youtube_short", contentId: "a", qualityScore: 100 },
      { id: "a5", platform: "linkedin", contentId: "a", qualityScore: 100 },
      { id: "a6", platform: "facebook", contentId: "a", qualityScore: 100 },
      { id: "b1", platform: "tiktok", contentId: "b", qualityScore: 98 },
      { id: "b2", platform: "instagram_reel", contentId: "b", qualityScore: 98 },
      { id: "b3", platform: "instagram_carousel", contentId: "b", qualityScore: 98 },
      { id: "b4", platform: "youtube_short", contentId: "b", qualityScore: 98 },
      { id: "b5", platform: "linkedin", contentId: "b", qualityScore: 98 },
      { id: "b6", platform: "facebook", contentId: "b", qualityScore: 98 },
    ];

    const selected = selectDailyContent(candidates, { limit: 6, minQuality: 72 });
    const counts = selected.reduce<Record<string, number>>((acc, item) => {
      acc[item.contentId] = (acc[item.contentId] ?? 0) + 1;
      return acc;
    }, {});

    expect(selected).toHaveLength(6);
    expect(new Set(selected.map((item) => item.platform)).size).toBe(6);
    expect(counts.a).toBeLessThanOrEqual(3);
    expect(counts.b).toBeGreaterThanOrEqual(3);
  });
});

describe("planDailyQueue", () => {
  it("rebalances existing pending and deferred rows instead of freezing the old shortlist", () => {
    const candidates: DailyCandidate[] = [
      { id: "a1", platform: "tiktok", contentId: "a", qualityScore: 100 },
      { id: "a2", platform: "instagram_reel", contentId: "a", qualityScore: 100 },
      { id: "a3", platform: "instagram_carousel", contentId: "a", qualityScore: 100 },
      { id: "a4", platform: "youtube_short", contentId: "a", qualityScore: 100 },
      { id: "a5", platform: "linkedin", contentId: "a", qualityScore: 100 },
      { id: "a6", platform: "facebook", contentId: "a", qualityScore: 100 },
      { id: "b1", platform: "tiktok", contentId: "b", qualityScore: 98 },
      { id: "b2", platform: "instagram_reel", contentId: "b", qualityScore: 98 },
      { id: "b3", platform: "instagram_carousel", contentId: "b", qualityScore: 98 },
      { id: "b4", platform: "youtube_short", contentId: "b", qualityScore: 98 },
      { id: "b5", platform: "linkedin", contentId: "b", qualityScore: 98 },
      { id: "b6", platform: "facebook", contentId: "b", qualityScore: 98 },
    ];

    const plan = planDailyQueue(candidates, { limit: 6, minQuality: 72 });
    const pending = plan.filter((row) => row.status === "pending_approval");
    const deferred = plan.filter((row) => row.status === "deferred");
    const counts = pending.reduce<Record<string, number>>((acc, row) => {
      const original = candidates.find((item) => item.id === row.id)!;
      acc[original.contentId] = (acc[original.contentId] ?? 0) + 1;
      return acc;
    }, {});

    expect(pending).toHaveLength(6);
    expect(deferred).toHaveLength(6);
    expect(pending.map((row) => row.dailyRank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(counts.a).toBeLessThanOrEqual(3);
    expect(counts.b).toBeGreaterThanOrEqual(3);
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
