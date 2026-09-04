export type GrowthVisualScene = {
  kind: string;
  metricKey?: string;
  curatedAssetId?: string;
  captureAssetId?: string;
  headline?: string;
  body?: string;
};

export type GrowthVisualAssets = {
  structured: Record<string, Record<string, unknown>>;
  curated: Record<string, boolean>;
  captures: Record<string, boolean>;
};

export type VisualSourceDecision =
  | { kind: "structured_chart"; payload: Record<string, unknown> }
  | { kind: "curated_frame"; assetId: string }
  | { kind: "controlled_capture"; assetId: string }
  | { kind: "motion_fallback"; headline: string; body?: string };

export function resolveVisualSource(scene: GrowthVisualScene, assets: GrowthVisualAssets): VisualSourceDecision {
  if (scene.metricKey && assets.structured[scene.metricKey]) {
    return { kind: "structured_chart", payload: assets.structured[scene.metricKey] };
  }

  if (scene.curatedAssetId && assets.curated[scene.curatedAssetId]) {
    return { kind: "curated_frame", assetId: scene.curatedAssetId };
  }

  if (scene.captureAssetId && assets.captures[scene.captureAssetId]) {
    return { kind: "controlled_capture", assetId: scene.captureAssetId };
  }

  return {
    kind: "motion_fallback",
    headline: scene.headline?.trim() || "StockBox-analys",
    ...(scene.body?.trim() ? { body: scene.body.trim() } : {}),
  };
}
