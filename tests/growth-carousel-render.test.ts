import { describe, expect, it } from "vitest";
import { buildCarouselRenderPlan } from "../src/lib/growth/carousel-render-plan";

describe("growth carousel render plan", () => {
  it("plans numbered slides, cover, zip, and metadata", () => {
    expect(buildCarouselRenderPlan(5)).toEqual([
      "slide-01.png",
      "slide-02.png",
      "slide-03.png",
      "slide-04.png",
      "slide-05.png",
      "cover.png",
      "carousel.zip",
      "metadata.json",
    ]);
  });

  it("rejects slide counts outside the carousel contract", () => {
    expect(() => buildCarouselRenderPlan(2)).toThrow(/3.*8/i);
    expect(() => buildCarouselRenderPlan(9)).toThrow(/3.*8/i);
  });
});
