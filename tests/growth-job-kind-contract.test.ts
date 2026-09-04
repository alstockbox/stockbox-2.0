import { describe, expect, it } from "vitest";
import { GROWTH_RENDER_JOB_KINDS, assertGrowthRenderJobKind } from "@/lib/growth/render-job-kind";

describe("growth render job kind contract", () => {
  it("contains exactly the three approved render job kinds", () => {
    expect(GROWTH_RENDER_JOB_KINDS).toEqual(["video", "carousel", "static_image"]);
  });

  it.each(GROWTH_RENDER_JOB_KINDS)("accepts %s", (kind) => {
    expect(assertGrowthRenderJobKind(kind)).toBe(kind);
  });

  it("rejects unknown kinds before rendering", () => {
    expect(() => assertGrowthRenderJobKind("audio_only")).toThrow(/unsupported_growth_render_job_kind/);
  });
});
