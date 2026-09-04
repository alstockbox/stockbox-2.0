export function buildCarouselRenderPlan(slideCount: number): string[] {
  if (!Number.isInteger(slideCount) || slideCount < 3 || slideCount > 8) {
    throw new Error("Carousel slide count must be between 3 and 8");
  }

  const slides = Array.from({ length: slideCount }, (_, index) =>
    `slide-${String(index + 1).padStart(2, "0")}.png`,
  );

  return [...slides, "cover.png", "carousel.zip", "metadata.json"];
}
