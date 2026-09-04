import { timingSafeEqual } from "node:crypto";

export type GrowthWorkerAsset = {
  kind: "master_video" | "cover" | "voice_audio" | "metadata" | string;
  bucket: string;
  storagePath: string;
  checksumSha256: string;
};

// The deployed Edge API uses x-stockbox-growth-worker-token with the raw token
// value (not an Authorization/Bearer wrapper). Keep the pure test contract in
// sync with that boundary.
export function validateWorkerToken(supplied: string | null | undefined, expected: string): boolean {
  if (!expected || !supplied) return false;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function validateCompletionPayload(input: {
  qcPassed: boolean;
  contentId: string;
  renderJobId: string;
  expectedPrefix?: string;
  assets: GrowthWorkerAsset[];
}) {
  if (!input.qcPassed) throw new Error("QC must pass before a render can become ready");
  const prefix = input.expectedPrefix ?? "";
  const required = new Set(["master_video", "cover"]);

  for (const asset of input.assets) {
    if (!/^[A-Fa-f0-9]{64}$/.test(asset.checksumSha256)) {
      throw new Error(`Invalid checksum for ${asset.kind}`);
    }
    if (prefix && !asset.storagePath.startsWith(prefix)) {
      throw new Error(`Asset path escaped expected render prefix: ${asset.kind}`);
    }
    required.delete(asset.kind);
  }

  if (required.size > 0) {
    throw new Error(`Missing required render assets: ${[...required].join(",")}`);
  }

  return { ready: true as const };
}

export function decideRenderFailure(input: {
  attemptCount: number;
  maxAttempts: number;
  retryable: boolean;
}): "queued" | "failed" {
  if (!input.retryable) return "failed";
  return input.attemptCount < input.maxAttempts ? "queued" : "failed";
}
