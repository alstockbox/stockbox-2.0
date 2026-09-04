export type GrowthAssetAccessInput = {
  id: string;
  kind: string;
  bucket: string;
  storage_path: string;
  qc_status: string;
  mime_type?: string | null;
};

export type GrowthAssetAccess = {
  bucket: "growth-ready-assets";
  path: string;
  expiresIn: 120;
  disposition: "inline" | "attachment";
  filename: string;
};

const DOWNLOADABLE_KINDS = new Set([
  "master_video",
  "cover",
  "carousel_slide",
  "carousel_zip",
  "static_image",
]);

function extension(asset: GrowthAssetAccessInput) {
  const fromPath = asset.storage_path.match(/\.([A-Za-z0-9]{1,8})$/)?.[1]?.toLowerCase();
  if (fromPath) return fromPath;
  const mime = String(asset.mime_type || "").toLowerCase();
  if (mime === "video/mp4") return "mp4";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "application/zip") return "zip";
  return "bin";
}

function safeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "asset";
}

function validatePath(path: string) {
  if (!path || path.startsWith("/") || path.includes("\\")) throw new Error("growth_asset_invalid_path");
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("growth_asset_invalid_path");
  }
  return path;
}

export function resolveGrowthAssetAccess(
  asset: GrowthAssetAccessInput,
  requestedDownload: boolean,
): GrowthAssetAccess {
  if (
    asset.bucket !== "growth-ready-assets" ||
    asset.qc_status !== "passed" ||
    !DOWNLOADABLE_KINDS.has(asset.kind)
  ) {
    throw new Error("growth_asset_not_ready");
  }

  const path = validatePath(String(asset.storage_path || ""));
  const kind = safeToken(asset.kind.replaceAll("_", "-"));
  const id = safeToken(String(asset.id));

  return {
    bucket: "growth-ready-assets",
    path,
    expiresIn: 120,
    disposition: requestedDownload ? "attachment" : "inline",
    filename: `stockbox-${kind}-${id}.${extension(asset)}`,
  };
}
