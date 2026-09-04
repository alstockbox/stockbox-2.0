export type DistributionPackageStatus = "draft" | "ready" | "posted" | "deferred" | "failed";

const ALLOWED_TRANSITIONS: Record<DistributionPackageStatus, ReadonlySet<DistributionPackageStatus>> = {
  draft: new Set(),
  ready: new Set(["posted", "deferred"]),
  posted: new Set(),
  deferred: new Set(["ready"]),
  failed: new Set(),
};

export function canTransitionDistributionPackage(from: string, to: string) {
  if (!(from in ALLOWED_TRANSITIONS)) return false;
  if (!(to in ALLOWED_TRANSITIONS)) return false;
  return ALLOWED_TRANSITIONS[from as DistributionPackageStatus].has(to as DistributionPackageStatus);
}
