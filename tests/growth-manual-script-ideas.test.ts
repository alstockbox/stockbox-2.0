import { describe, expect, it } from "vitest";
import { buildFounderScriptIdeas } from "@/lib/growth/manual-script-ideas";

describe("optional founder script ideas", () => {
  const topics = [
    { topicKey: "risk", title: "Tre risker att kontrollera i ett bolag", qualityScore: 96, category: "risk", platformHint: "instagram_reel" },
    { topicKey: "cashflow", title: "Så läser du kassaflödet snabbare", qualityScore: 91, category: "cashflow", platformHint: "tiktok" },
  ];

  it("returns one or two complete optional script ideas", () => {
    const ideas = buildFounderScriptIdeas(topics, 2);
    expect(ideas.length).toBeGreaterThanOrEqual(1);
    expect(ideas.length).toBeLessThanOrEqual(2);
    expect(ideas[0]).toMatchObject({ automaticRender: false });
    expect(ideas[0]?.hook).toBeTruthy();
    expect(ideas[0]?.script).toBeTruthy();
    expect(ideas[0]?.screenDirections).toBeTruthy();
    expect(ideas[0]?.caption).toBeTruthy();
    expect(ideas[0]?.cta).toBeTruthy();
    expect(ideas[0]?.recommendedPlatform).toBeTruthy();
  });

  it("never emits quality-rejected topics", () => {
    const ideas = buildFounderScriptIdeas([...topics, { topicKey: "bad", title: "Irrelevant", qualityScore: 30, category: "other", platformHint: "youtube_short" }], 2);
    expect(ideas.map((idea) => idea.topicKey)).not.toContain("bad");
  });

  it("never converts optional founder scripts into automatic render output", () => {
    const ideas = buildFounderScriptIdeas(topics, 2);
    expect(ideas.every((idea) => idea.automaticRender === false)).toBe(true);
  });
});
