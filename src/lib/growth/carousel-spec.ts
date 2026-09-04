import { z } from "zod";

export const CarouselVisualKindSchema = z.enum([
  "metric",
  "chart",
  "stockbox_ui",
  "icon",
  "cta",
]);

export const CarouselSlideSpecSchema = z.object({
  index: z.number().int().min(1).max(8),
  headline: z.string().trim().min(3).max(90),
  body: z.string().trim().min(1).max(220),
  visualKind: CarouselVisualKindSchema,
});

export const CarouselSpecSchema = z
  .object({
    version: z.literal("v3"),
    contentId: z.string().trim().min(1).max(160),
    title: z.string().trim().min(3).max(120),
    slides: z.array(CarouselSlideSpecSchema).min(3).max(8),
    caption: z.string().trim().min(3).max(2200),
    cta: z.string().trim().min(3).max(180),
  })
  .superRefine((value, ctx) => {
    for (let offset = 0; offset < value.slides.length; offset += 1) {
      const expected = offset + 1;
      if (value.slides[offset]?.index !== expected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", offset, "index"],
          message: `Slide index must be continuous from 1; expected ${expected}`,
        });
      }
    }

    for (let offset = 0; offset < value.slides.length - 1; offset += 1) {
      if (value.slides[offset]?.visualKind === "cta") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", offset, "visualKind"],
          message: "CTA visual is reserved for the final slide",
        });
      }
    }
  });

export type CarouselVisualKind = z.infer<typeof CarouselVisualKindSchema>;
export type CarouselSlideSpec = z.infer<typeof CarouselSlideSpecSchema>;
export type CarouselSpec = z.infer<typeof CarouselSpecSchema>;
