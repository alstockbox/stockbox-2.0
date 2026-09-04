import { describe, expect, it } from "vitest";
import { buildGrowthStoryboard } from "@/lib/growth/storyboard";
import { RenderSpecSchema } from "@/lib/growth/render-spec";

describe("deterministic growth storyboard", () => {
  const input = {
    contentId: "content-1",
    renderJobId: "job-1",
    language: "sv" as const,
    template: "educational_checklist" as const,
    title: "Tre saker att kontrollera",
    hook: "Tre varningssignaler på 35 sekunder",
    script: "Börja med skuldsättningen. Kontrollera sedan kassaflödet och räntetäckningen. Jämför utvecklingen över tid så att en enskild siffra inte lurar dig. Avsluta med att sätta värderingen i relation till kvalitet och risk.",
    ctaText: "Analysera bolaget i StockBox",
    ctaUrl: "https://www.getstockbox.app/",
  };

  it("builds hook, body and CTA scenes for a short educational video", () => {
    const spec = buildGrowthStoryboard(input);
    expect(spec.scenes[0]?.id).toBe("hook");
    expect(spec.scenes.filter((scene) => scene.id.startsWith("body-")).length).toBeGreaterThanOrEqual(2);
    expect(spec.scenes.at(-1)?.kind).toBe("cta");
    expect(RenderSpecSchema.parse(spec).version).toBe("v3");
  });

  it("keeps the CTA in the final 3-5 seconds", () => {
    const spec = buildGrowthStoryboard(input);
    const final = spec.scenes.at(-1)!;
    expect(final.endMs - final.startMs).toBeGreaterThanOrEqual(3000);
    expect(final.endMs - final.startMs).toBeLessThanOrEqual(5000);
    expect(final.endMs).toBe(Math.max(...spec.scenes.map((scene) => scene.endMs)));
  });

  it("does not require a generated micro-scene", () => {
    const spec = buildGrowthStoryboard({ ...input, allowGeneratedScene: false });
    expect(spec.scenes.some((scene) => scene.kind === "generated_micro_scene")).toBe(false);
  });

  it("falls back to motion graphics when StockBox visual references are missing", () => {
    const spec = buildGrowthStoryboard({ ...input, preferredVisualRefs: [] });
    expect(spec.scenes.some((scene) => scene.kind === "motion_graphic")).toBe(true);
  });
});
