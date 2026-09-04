import { describe, expect, it } from "vitest";
import {
  DistributionPlatformSchema,
  MediaAssetKindSchema,
  RenderJobKindSchema,
  RenderSpecSchema,
  RenderTemplateSchema,
  SceneKindSchema,
} from "../src/lib/growth/render-spec";

const baseSpec = {
  version: "v3" as const,
  contentId: "content-1",
  renderJobId: "job-1",
  language: "sv" as const,
  template: "educational_checklist" as const,
  title: "Tre saker att kontrollera",
  hook: "Tre varningssignaler på 30 sekunder",
  script: "Första punkten är skuldsättningen.",
  voiceMode: "educational" as const,
  scenes: [
    {
      id: "scene-1",
      kind: "stockbox_ui" as const,
      startMs: 0,
      endMs: 4000,
      headline: "1. Skuld",
    },
  ],
  subtitles: [{ startMs: 0, endMs: 1800, text: "Tre varningssignaler" }],
  cta: { text: "Analysera bolaget i StockBox", url: "https://www.getstockbox.app/" },
};

describe("growth render contracts", () => {
  it("accepts a valid Swedish template render", () => {
    expect(RenderSpecSchema.parse(baseSpec).contentId).toBe("content-1");
  });

  it("rejects non-positive scene duration", () => {
    expect(() => RenderSpecSchema.parse({ ...baseSpec, scenes: [{ ...baseSpec.scenes[0], endMs: 0 }] })).toThrow();
  });

  it("rejects a render longer than 60 seconds", () => {
    expect(() => RenderSpecSchema.parse({ ...baseSpec, scenes: [{ ...baseSpec.scenes[0], endMs: 61000 }] })).toThrow();
  });

  it("rejects subtitles that extend past the final scene", () => {
    expect(() => RenderSpecSchema.parse({ ...baseSpec, subtitles: [{ startMs: 3500, endMs: 4500, text: "För sent" }] })).toThrow();
  });

  it("rejects unapproved Swedish automatic voice modes", () => {
    expect(() => RenderSpecSchema.parse({ ...baseSpec, voiceMode: "generic" })).toThrow();
  });

  it("does not require a generated micro-scene", () => {
    const parsed = RenderSpecSchema.parse(baseSpec);
    expect(parsed.scenes.some((scene) => scene.kind === "generated_micro_scene")).toBe(false);
  });

  it("preserves deterministic visual-source fields through schema validation", () => {
    const parsed = RenderSpecSchema.parse({
      ...baseSpec,
      scenes: [{
        ...baseSpec.scenes[0],
        metricKey: "net_debt_to_ebitda",
        curatedAssetId: "stockbox-risk-card",
        visualSource: { kind: "structured_chart", payload: { value: 2.1 } },
      }],
    });
    expect(parsed.scenes[0]).toMatchObject({
      metricKey: "net_debt_to_ebitda",
      curatedAssetId: "stockbox-risk-card",
      visualSource: { kind: "structured_chart", payload: { value: 2.1 } },
    });
  });

  it("keeps platform/template/scene/job identifiers stable", () => {
    expect(DistributionPlatformSchema.parse("facebook_reel")).toBe("facebook_reel");
    expect(RenderTemplateSchema.parse("company_comparison")).toBe("company_comparison");
    expect(SceneKindSchema.parse("generated_micro_scene")).toBe("generated_micro_scene");
    expect(RenderJobKindSchema.options).toEqual(["video", "carousel", "static_image"]);
    expect(() => DistributionPlatformSchema.parse("twitter")).toThrow();
  });

  it("keeps the asset registry aligned with the approved media model", () => {
    expect(MediaAssetKindSchema.parse("screenshot")).toBe("screenshot");
    expect(MediaAssetKindSchema.parse("generated_scene")).toBe("generated_scene");
    expect(MediaAssetKindSchema.parse("master_video")).toBe("master_video");
  });
});