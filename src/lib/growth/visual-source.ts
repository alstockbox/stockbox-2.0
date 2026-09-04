export type GrowthVisualScene = {
  kind: "stockbox_ui" | "motion_graphic" | "chart" | "generated_micro_scene" | "cta";
  metricKey?: string;
  captureId?: string;
  curatedId?: string;
  headline?: string;
  body?: string;
};

export type GrowthVisualAssets = {
  structured: Record<string, Record<string, unknown>>;
  captures: Record<string, { assetId: string }>;
  curated: Record<string, { assetId: string }>;
};

export type VisualSourceDecision =
  | { kind: "structured_chart"; payload: Record<string, unknown> }
  | { kind: "curated_frame"; assetId: string }
  | { kind: "controlled_capture"; assetId: string }
  | { kind: "motion_fallback"; headline: string; body?: string };

export function resolveVisualSources(
  scene: GrowthVisualScene,
  availableAssets: GrowthVisualAssets,
): VisualSourceDecision {
  if (scene.metricKey && availableAssets.structured[scene.metricKey]) {
    return { kind: "structured_chart", payload: availableAssets.structured[scene.metricKey] };
  }

  if (scene.captureId && availableAssets.captures[scene.captureId]) {
    return { kind: "controlled_capture", assetId: availableAssets.captures[scene.captureId].assetId };
  }

  if (scene.curatedId && availableAssets.curated[scene.curatedId]) {
    return { kind: "curated_frame", assetId: availableAssets.curated[scene.curatedId].assetId };
  }

  return {
    kind: "motion_fallback",
    headline: scene.headline || "StockBox-analys",
    ...(scene.body ? { body: scene.body } : {}),
  };
}
