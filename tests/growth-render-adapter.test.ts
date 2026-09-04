import { describe, expect, it } from "vitest";
import { toGrowthCompositionProps } from "../src/video/render-adapter";

const baseSpec = {
  version: "v3" as const,
  contentId: "content-1",
  renderJobId: "job-1",
  language: "sv" as const,
  template: "educational_checklist" as const,
  title: "Tre risker",
  hook: "Tre risker på 30 sekunder",
  script: "Första punkten är skuldsättningen.",
  voiceMode: "educational" as const,
  scenes: [
    {
      id: "s1",
      kind: "stockbox_ui" as const,
      startMs: 0,
      endMs: 30000,
      headline: "Risk",
    },
  ],
  subtitles: [],
  cta: { text: "Testa StockBox", url: "https://www.getstockbox.app/" },
};

describe("growth render adapter", () => {
  it("derives a 30fps vertical composition from the validated final scene", () => {
    expect(toGrowthCompositionProps(baseSpec)).toMatchObject({
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: 900,
    });
  });

  it("rejects invalid render specs instead of coercing them", () => {
    expect(() =>
      toGrowthCompositionProps({
        ...baseSpec,
        scenes: [{ ...baseSpec.scenes[0], endMs: 61000 }],
      }),
    ).toThrow();
  });
});
