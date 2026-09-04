export type RetentionAsset = {
  id: string;
  bucket: string;
  storagePath: string;
  kind: string;
  createdAt: string;
  renderState: string | null;
  packageStatus: string | null;
};

export type RetentionAction = {
  assetId: string;
  bucket: string;
  storagePath: string;
  reason: "staging_completed" | "staging_failed_expired" | "ready_retention_expired";
};

export type RetentionPolicyInput = {
  now: Date;
  readyRetentionDays: number;
  assets: RetentionAsset[];
};

const ACTIVE_PACKAGE_STATES = new Set(["ready", "published", "active", "queued", "pending_approval"]);

function ageMs(now: Date, createdAt: string) {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, now.getTime() - created);
}

export function selectRetentionActions(input: RetentionPolicyInput): RetentionAction[] {
  const readyRetentionMs = Math.max(1, input.readyRetentionDays) * 86_400_000;
  const failedStagingMs = 24 * 60 * 60 * 1000;
  const actions: RetentionAction[] = [];

  for (const asset of input.assets) {
    if (asset.bucket === "growth-voice-private") continue;

    const age = ageMs(input.now, asset.createdAt);
    if (asset.bucket === "growth-render-staging") {
      if (asset.renderState === "ready") {
        actions.push({ assetId: asset.id, bucket: asset.bucket, storagePath: asset.storagePath, reason: "staging_completed" });
      } else if (asset.renderState === "failed" && age >= failedStagingMs) {
        actions.push({ assetId: asset.id, bucket: asset.bucket, storagePath: asset.storagePath, reason: "staging_failed_expired" });
      }
      continue;
    }

    if (asset.bucket !== "growth-ready-assets") continue;
    if (asset.packageStatus && ACTIVE_PACKAGE_STATES.has(asset.packageStatus)) continue;
    if (age >= readyRetentionMs) {
      actions.push({ assetId: asset.id, bucket: asset.bucket, storagePath: asset.storagePath, reason: "ready_retention_expired" });
    }
  }

  return actions;
}
