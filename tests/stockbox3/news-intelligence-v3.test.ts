import { describe, expect, it } from "vitest";
import {
  deriveNewsEventV3,
  rankAndDedupeNewsEventsV3,
} from "@/lib/news/news-intelligence-v3";

describe("StockBox 3 news intelligence", () => {
  it("treats thesis-changing events as more material than generic product news", () => {
    const rejection = deriveNewsEventV3({
      id: "1",
      ticker: "BIO",
      title: "FDA rejects BIO lead drug application",
      summary: "The regulator rejected the company's lead drug application.",
      publishedAt: "2026-09-08T18:00:00Z",
      source: "wire",
      url: "https://example.com/rejection",
    });
    const launch = deriveNewsEventV3({
      id: "2",
      ticker: "TECH",
      title: "TECH launches new consumer accessory",
      summary: "The company announced a routine product refresh.",
      publishedAt: "2026-09-08T18:00:00Z",
      source: "wire",
      url: "https://example.com/launch",
    });

    expect(rejection.eventType).toBe("regulatory");
    expect(rejection.materiality).toBeGreaterThan(launch.materiality);
    expect(rejection.direction).toBe("negative");
    expect(rejection.requiresRecommendationReview).toBe(true);
  });

  it("detects earnings/guidance as recommendation-relevant events", () => {
    const event = deriveNewsEventV3({
      id: "3",
      ticker: "TEST",
      title: "TEST cuts full-year guidance after earnings miss",
      summary: "Revenue missed expectations and management reduced full-year guidance.",
      publishedAt: "2026-09-08T18:00:00Z",
      source: "wire",
      url: "https://example.com/earnings",
    });

    expect(["earnings", "guidance"]).toContain(event.eventType);
    expect(event.materiality).toBeGreaterThanOrEqual(75);
    expect(event.requiresRecommendationReview).toBe(true);
  });

  it("deduplicates syndicated headlines and ranks by materiality", () => {
    const events = rankAndDedupeNewsEventsV3([
      {
        id: "a",
        ticker: "AAA",
        title: "AAA announces acquisition of Rival",
        summary: "AAA agreed to acquire Rival in a major transaction.",
        publishedAt: "2026-09-08T18:00:00Z",
        source: "source-a",
        url: "https://a.example.com/deal",
      },
      {
        id: "b",
        ticker: "AAA",
        title: "AAA announces acquisition of Rival",
        summary: "Syndicated version of the same transaction.",
        publishedAt: "2026-09-08T18:01:00Z",
        source: "source-b",
        url: "https://b.example.com/deal",
      },
      {
        id: "c",
        ticker: "AAA",
        title: "AAA opens a small regional office",
        summary: "A routine corporate update.",
        publishedAt: "2026-09-08T17:00:00Z",
        source: "source-c",
        url: "https://c.example.com/office",
      },
    ]);

    expect(events).toHaveLength(2);
    expect(events[0].eventType).toBe("m_and_a");
  });
});
