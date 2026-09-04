import { canPromoteRenderToReadyEdge } from "./promotion-policy.ts";

export const VIDEO_DISTRIBUTION_PLATFORMS = [
  "instagram_reel",
  "facebook_reel",
  "tiktok",
  "youtube_short",
] as const;

export type VideoPackageInput = {
  renderJobId: string;
  contentId: string;
  masterAssetId: string;
  title: string;
  caption: string;
  baseUrl: string;
  shadowMode: boolean;
  campaign?: string;
};

export type CompletionVideoPackageInput = VideoPackageInput & {
  promotionAllowed: boolean;
};

export type CompletedVideoPreparationInput = VideoPackageInput & {
  renderState: string;
  language: "sv" | "en";
  founderVoiceActive: boolean;
  assets: Array<{ kind: string; qcStatus: string }>;
  paidOperations: Array<{ provider: string; ledgerRecorded: boolean }>;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanCopy(text: string, trackedUrl: string) {
  let value = String(text || "").trim();
  if (trackedUrl) {
    const escaped = escapeRegExp(trackedUrl);
    value = value
      .replace(new RegExp(`Testa\\s+StockBox\\s*:\\s*${escaped}`, "gi"), "")
      .replace(new RegExp(escaped, "g"), "");
  }
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

function trackedUrl(baseUrl: string, platform: string, contentId: string, campaign: string) {
  const base = baseUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    utm_source: platform,
    utm_medium: "organic_social",
    utm_campaign: campaign,
    utm_content: contentId,
  });
  return `${base}/?${params.toString()}`;
}

function withSingleTrackedLink(copy: string, url: string) {
  const cleaned = cleanCopy(copy, url);
  return `${cleaned}\n\nTesta StockBox: ${url}`.trim();
}

export function buildVideoDistributionPackages(input: VideoPackageInput) {
  const campaign = input.campaign || "auto_growth_v3";
  const title = String(input.title || "StockBox").trim() || "StockBox";
  const caption = String(input.caption || title).trim() || title;

  return VIDEO_DISTRIBUTION_PLATFORMS.map((platform) => {
    const utmUrl = trackedUrl(input.baseUrl, platform, input.contentId, campaign);
    const platformCopy = platform === "tiktok"
      ? withSingleTrackedLink(`${caption}\n\n#aktier #börsen #aktieanalys`, utmUrl)
      : withSingleTrackedLink(caption, utmUrl);
    return {
      idempotency_key: `v3:${input.renderJobId}:${platform}`,
      content_id: input.contentId,
      render_job_id: input.renderJobId,
      master_asset_id: input.masterAssetId,
      platform,
      title: platform === "youtube_short" ? title : null,
      caption: platform === "youtube_short" ? null : platformCopy,
      description: platform === "youtube_short" ? platformCopy : null,
      utm_url: utmUrl,
      status: input.shadowMode ? "draft" : "ready",
      metadata: { master_reuse: true, growth_v3: true },
    };
  });
}

export function buildCompletionVideoPackages(input: CompletionVideoPackageInput) {
  return buildVideoDistributionPackages({
    ...input,
    shadowMode: input.shadowMode || !input.promotionAllowed,
  });
}

export function prepareCompletedVideoPackages(input: CompletedVideoPreparationInput) {
  const candidates = buildVideoDistributionPackages({ ...input, shadowMode: true });
  const promotion = canPromoteRenderToReadyEdge({
    shadowMode: input.shadowMode,
    renderState: input.renderState,
    language: input.language,
    founderVoiceActive: input.founderVoiceActive,
    assets: input.assets,
    paidOperations: input.paidOperations,
    packages: candidates.map((pkg) => ({
      platform: pkg.platform,
      copy: pkg.description ?? pkg.caption ?? "",
      utmUrl: pkg.utm_url,
    })),
  });

  return {
    promotion,
    packages: buildCompletionVideoPackages({ ...input, promotionAllowed: promotion.allowed }),
  };
}
