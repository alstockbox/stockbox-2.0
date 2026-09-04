export const GROWTH_RENDER_JOB_KINDS = ["video", "carousel", "static_image"] as const;

export type GrowthRenderJobKind = (typeof GROWTH_RENDER_JOB_KINDS)[number];

export function isGrowthRenderJobKind(value: unknown): value is GrowthRenderJobKind {
  return typeof value === "string" && (GROWTH_RENDER_JOB_KINDS as readonly string[]).includes(value);
}

export function assertGrowthRenderJobKind(value: unknown): GrowthRenderJobKind {
  if (!isGrowthRenderJobKind(value)) {
    throw new Error(`unsupported_growth_render_job_kind:${String(value)}`);
  }
  return value;
}
