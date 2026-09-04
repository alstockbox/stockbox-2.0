import { describe, expect, it } from "vitest";
import { RenderJobKindSchema, resolveRenderJobHandler } from "@/lib/growth/job-kind";

describe("growth render job kinds", () => {
  it("contains exactly the three approved job kinds", () => {
    expect(RenderJobKindSchema.options).toEqual(["video", "carousel", "static_image"]);
  });

  it("maps each approved kind to one explicit worker handler", () => {
    expect(resolveRenderJobHandler("video")).toBe("renderVideo");
    expect(resolveRenderJobHandler("carousel")).toBe("renderCarousel");
    expect(resolveRenderJobHandler("static_image")).toBe("renderStaticImage");
  });

  it("rejects unknown job kinds before rendering", () => {
    expect(() => resolveRenderJobHandler("story" as never)).toThrow("unsupported_job_kind");
  });
});
