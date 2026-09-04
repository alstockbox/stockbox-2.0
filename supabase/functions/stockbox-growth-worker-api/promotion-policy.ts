export type EdgeGrowthPromotionInput = {
  shadowMode: boolean;
  renderState: string;
  language: "sv" | "en";
  founderVoiceActive: boolean;
  assets: Array<{ kind: string; qcStatus: string }>;
  paidOperations: Array<{ provider: string; ledgerRecorded: boolean }>;
  packages: Array<{ platform: string; copy: string; utmUrl: string }>;
};

export function canPromoteRenderToReadyEdge(input: EdgeGrowthPromotionInput) {
  const reasons: string[] = [];
  if (input.shadowMode) reasons.push("shadow_mode");
  if (input.renderState !== "ready") reasons.push("render_not_ready");

  const master = input.assets.find((asset) => asset.kind === "master_video");
  const cover = input.assets.find((asset) => asset.kind === "cover");
  if (!master || master.qcStatus !== "passed") reasons.push("master_video_not_ready");
  if (!cover || cover.qcStatus !== "passed") reasons.push("cover_not_ready");

  if (input.language === "sv" && !input.founderVoiceActive) {
    reasons.push("founder_voice_not_active");
  }

  if (input.paidOperations.some((operation) => !operation.ledgerRecorded)) {
    reasons.push("budget_telemetry_missing");
  }

  if (
    input.packages.length === 0 ||
    input.packages.some((pkg) => !pkg.utmUrl || !pkg.copy.includes(pkg.utmUrl))
  ) {
    reasons.push("package_tracking_missing");
  }

  return { allowed: reasons.length === 0, reasons };
}
