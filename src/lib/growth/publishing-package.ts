import type { DistributionPlatform } from "./render-spec";

export type PublishingPackageInput = {
  platform: DistributionPlatform;
  title?: string | null;
  caption?: string | null;
  script?: string | null;
  mediaInstructions?: string | null;
  utmUrl?: string | null;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanCopy(text: string | null | undefined, utmUrl: string) {
  if (!text) return "";

  let value = text.trim();
  if (utmUrl) {
    const escaped = escapeRegExp(utmUrl);
    value = value
      .replace(new RegExp(`Testa\\s+StockBox\\s*:\\s*${escaped}`, "gi"), "")
      .replace(new RegExp(escaped, "g"), "");
  }

  return value
    .replace(/Testa\s+StockBox\s*:\s*$/gim, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildPublishingPackage(input: PublishingPackageInput) {
  const platform = input.platform.toLowerCase();
  const title = (input.title || "StockBox").trim();
  const url = (input.utmUrl || "").trim();
  const caption = cleanCopy(input.caption, url);
  const script = cleanCopy(input.script, url);
  const mediaInstructions = cleanCopy(input.mediaInstructions, url);
  const parts: string[] = [];

  if (platform === "youtube_short") {
    parts.push(`RUBRIK:\n${title}`);
    if (script) parts.push(`MANUS:\n${script}`);
    if (mediaInstructions) parts.push(`VIDEO-UPPLÄGG:\n${mediaInstructions}`);
    if (caption) parts.push(`BESKRIVNING:\n${caption}`);
  } else if (["tiktok", "instagram_reel", "facebook_reel"].includes(platform)) {
    if (script) parts.push(`MANUS:\n${script}`);
    if (mediaInstructions) parts.push(`VIDEO-UPPLÄGG:\n${mediaInstructions}`);
    if (caption) parts.push(`CAPTION:\n${caption}`);
  } else if (platform === "instagram_carousel") {
    parts.push(`RUBRIK:\n${title}`);
    if (mediaInstructions) parts.push(`SLIDES:\n${mediaInstructions}`);
    if (caption) parts.push(`CAPTION:\n${caption}`);
  } else {
    parts.push(`INLÄGG:\n${caption || script || title}`);
  }

  if (url) {
    parts.push("CTA:\nTesta StockBox via länken nedan.");
    parts.push(`LÄNK:\n${url}`);
  }

  return parts.join("\n\n");
}

export type MasterVideoPackageInput = {
  renderJobId: string;
  contentId: string;
  masterAssetId: string;
  title: string;
  caption: string;
  baseUrl: string;
  shadowMode: boolean;
  campaign?: string;
};

export type MasterVideoDistributionPackage = {
  idempotencyKey: string;
  renderJobId: string;
  contentId: string;
  masterAssetId: string;
  platform: "instagram_reel" | "facebook_reel" | "tiktok" | "youtube_short";
  title: string | null;
  caption: string | null;
  description: string | null;
  utmUrl: string;
  status: "draft" | "ready";
};

const MASTER_VIDEO_PLATFORMS = [
  "instagram_reel",
  "facebook_reel",
  "tiktok",
  "youtube_short",
] as const;

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

export function buildMasterVideoDistributionPackages(
  input: MasterVideoPackageInput,
): MasterVideoDistributionPackage[] {
  const campaign = input.campaign || "auto_growth_v3";
  const title = input.title.trim() || "StockBox";
  const baseCaption = input.caption.trim() || title;

  return MASTER_VIDEO_PLATFORMS.map((platform) => {
    const utmUrl = trackedUrl(input.baseUrl, platform, input.contentId, campaign);
    const socialCaption = platform === "tiktok"
      ? withSingleTrackedLink(`${baseCaption}\n\n#aktier #börsen #aktieanalys`, utmUrl)
      : withSingleTrackedLink(baseCaption, utmUrl);
    const youtubeDescription = withSingleTrackedLink(baseCaption, utmUrl);

    return {
      idempotencyKey: `v3:${input.renderJobId}:${platform}`,
      renderJobId: input.renderJobId,
      contentId: input.contentId,
      masterAssetId: input.masterAssetId,
      platform,
      title: platform === "youtube_short" ? title : null,
      caption: platform === "youtube_short" ? null : socialCaption,
      description: platform === "youtube_short" ? youtubeDescription : null,
      utmUrl,
      status: input.shadowMode ? "draft" : "ready",
    };
  });
}
