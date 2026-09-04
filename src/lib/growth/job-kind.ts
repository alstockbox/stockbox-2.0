import { z } from "zod";

export const RenderJobKindSchema = z.enum(["video", "carousel", "static_image"]);

export type RenderJobKind = z.infer<typeof RenderJobKindSchema>;
export type RenderJobHandler = "renderVideo" | "renderCarousel" | "renderStaticImage";

const HANDLER_BY_KIND: Record<RenderJobKind, RenderJobHandler> = {
  video: "renderVideo",
  carousel: "renderCarousel",
  static_image: "renderStaticImage",
};

export function resolveRenderJobHandler(input: RenderJobKind): RenderJobHandler {
  const parsed = RenderJobKindSchema.safeParse(input);
  if (!parsed.success) throw new Error("unsupported_job_kind");
  return HANDLER_BY_KIND[parsed.data];
}
