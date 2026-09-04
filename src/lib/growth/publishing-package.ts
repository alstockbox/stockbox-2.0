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
  } else if (["tiktok", "instagram_reel"].includes(platform)) {
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
