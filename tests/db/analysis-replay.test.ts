import type { AnalysisReport } from "../../src/lib/analysis/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { getAnalysisReplay, persistAnalysis } from "../../src/lib/db/repositories";

function replayClient(row: { id: string; report: AnalysisReport; idempotency_fingerprint: string } | null, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error });
  const secondEq = vi.fn().mockReturnValue({ maybeSingle });
  const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
  const select = vi.fn().mockReturnValue({ eq: firstEq });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { from }, from, select, firstEq, secondEq, maybeSingle };
}

function report(): AnalysisReport {
  return {
    id: "temporary-id", ticker: "BOX", companyName: "Box Systems", analysisType: "summary",
    investmentProfile: "balanced", score: { score: 70 }, recommendation: "Hold",
  } as unknown as AnalysisReport;
}

describe("analysis idempotency repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the stored analysis for the same user, key and request fingerprint", async () => {
    const db = replayClient({ id: "stored-id", report: report(), idempotency_fingerprint: "a".repeat(64) });
    mocks.createAdminClient.mockReturnValue(db.client);

    const result = await getAnalysisReplay({
      userId: "user-1", idempotencyKey: "key-1", requestFingerprint: "a".repeat(64),
    });

    expect(result).toMatchObject({ status: "replay", id: "stored-id", report: { id: "stored-id" } });
    expect(db.from).toHaveBeenCalledWith("analyses");
    expect(db.firstEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(db.secondEq).toHaveBeenCalledWith("idempotency_key", "key-1");
  });

  it("rejects a retry key when the stored request fingerprint differs", async () => {
    const db = replayClient({ id: "stored-id", report: report(), idempotency_fingerprint: "b".repeat(64) });
    mocks.createAdminClient.mockReturnValue(db.client);

    const result = await getAnalysisReplay({
      userId: "user-1", idempotencyKey: "key-1", requestFingerprint: "a".repeat(64),
    });

    expect(result).toEqual({ status: "conflict" });
  });

  it("turns a concurrent unique-constraint loser into a replay of the stored winner", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
    const insertSelect = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    const insertClient = { from: vi.fn().mockReturnValue({ insert }) };
    const stored = report();
    const db = replayClient({ id: "winner-id", report: stored, idempotency_fingerprint: "c".repeat(64) });
    mocks.createAdminClient.mockReturnValueOnce(insertClient).mockReturnValueOnce(db.client);

    const result = await persistAnalysis({
      userId: "user-1", report: stored, rawProviderWarnings: [],
      idempotencyKey: "key-race", requestFingerprint: "c".repeat(64),
    });

    expect(result).toMatchObject({ ok: true, id: "winner-id", replayed: true, report: { id: "winner-id" } });
  });
});
