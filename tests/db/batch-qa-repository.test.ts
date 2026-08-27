import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchQaResult } from "../../src/lib/analysis";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  upsert: vi.fn(),
  order: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { getBatchQaResults, persistBatchQaResult } from "../../src/lib/db/repositories";

const result: BatchQaResult = {
  batchId: "batch-1",
  rerunKey: "run-2",
  modelVersion: "engine-v2",
  scorePolicyVersion: "policy-v2",
  benchmarkVersion: "bench-v1",
  canonicalInputFingerprint: "abc123",
  providerVersions: { "sec-companyfacts": "sec-v2" },
  analysisTimestamp: "2026-08-25T00:00:00.000Z",
  canonicalEntity: "issuer:aapl",
  archetype: "standard",
  coverage: 0.8,
  confidence: 75,
  score: 72.5,
  rating: "Buy",
  flags: ["TTM_FALLBACK"],
};

describe("batch QA repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => ({ upsert: mocks.upsert })) });
  });

  it("persists score, rating, versions and canonical fingerprint", async () => {
    await expect(persistBatchQaResult(result)).resolves.toEqual({ ok: true });

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      score: 72.5,
      rating: "Buy",
      score_policy_version: "policy-v2",
      benchmark_version: "bench-v1",
      canonical_input_fingerprint: "abc123",
    }), { onConflict: "batch_id,rerun_key,canonical_entity" });
  });

  it("reads a stored rerun back into canonical BatchQaResult rows", async () => {
    mocks.order.mockResolvedValue({
      data: [{
        batch_id: result.batchId,
        rerun_key: result.rerunKey,
        model_version: result.modelVersion,
        score_policy_version: result.scorePolicyVersion,
        benchmark_version: result.benchmarkVersion,
        canonical_input_fingerprint: result.canonicalInputFingerprint,
        provider_versions: result.providerVersions,
        analysis_timestamp: result.analysisTimestamp,
        canonical_entity: result.canonicalEntity,
        analysis_archetype: result.archetype,
        data_coverage: result.coverage,
        confidence: result.confidence,
        score: result.score,
        rating: result.rating,
        qa_flags: result.flags,
      }],
      error: null,
    });
    const secondEq = vi.fn(() => ({ order: mocks.order }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));
    mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    await expect(getBatchQaResults("batch-1", "run-2")).resolves.toEqual({ ok: true, data: [result] });
    expect(firstEq).toHaveBeenCalledWith("batch_id", "batch-1");
    expect(secondEq).toHaveBeenCalledWith("rerun_key", "run-2");
  });
});
