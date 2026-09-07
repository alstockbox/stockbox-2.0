import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { getDurableBatchRun } from "@/lib/batch/durable";

function maybeSingleQuery(result: unknown) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  return query;
}

function orderedQuery(result: unknown) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.order = vi.fn().mockResolvedValue(result);
  return query;
}

function inQuery(result: unknown) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.in = vi.fn().mockResolvedValue(result);
  return query;
}

describe("durable batch status lookup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports a transient run-query failure as unavailable instead of not found", async () => {
    const runQuery = maybeSingleQuery({ data: null, error: { message: "connection timeout" } });
    mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => runQuery) });

    await expect(getDurableBatchRun({ userId: "user-1", batchId: "batch-1" }))
      .resolves.toEqual({ status: "unavailable" });
  });

  it("returns not_found only when the run query succeeded and no row exists", async () => {
    const runQuery = maybeSingleQuery({ data: null, error: null });
    mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => runQuery) });

    await expect(getDurableBatchRun({ userId: "user-1", batchId: "batch-1" }))
      .resolves.toEqual({ status: "not_found" });
  });

  it("reports an item-query failure as unavailable instead of returning an empty batch", async () => {
    const run = { id: "batch-1", user_id: "user-1", status: "processing" };
    const runQuery = maybeSingleQuery({ data: run, error: null });
    const itemQuery = orderedQuery({ data: null, error: { message: "connection timeout" } });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => table === "batch_runs" ? runQuery : itemQuery),
    });

    await expect(getDurableBatchRun({ userId: "user-1", batchId: "batch-1" }))
      .resolves.toEqual({ status: "unavailable" });
  });

  it("reports an analysis-query failure as unavailable instead of returning partial reports", async () => {
    const run = { id: "batch-1", user_id: "user-1", status: "completed" };
    const runQuery = maybeSingleQuery({ data: run, error: null });
    const itemQuery = orderedQuery({ data: [{ id: "item-1", input_ticker: "AAPL", analysis_id: "analysis-1" }], error: null });
    const analysisQuery = inQuery({ data: null, error: { message: "connection timeout" } });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "batch_runs") return runQuery;
        if (table === "batch_items") return itemQuery;
        return analysisQuery;
      }),
    });

    await expect(getDurableBatchRun({ userId: "user-1", batchId: "batch-1" }))
      .resolves.toEqual({ status: "unavailable" });
  });

  it("wraps a successful lookup in an explicit found result", async () => {
    const run = { id: "batch-1", user_id: "user-1", status: "completed" };
    const runQuery = maybeSingleQuery({ data: run, error: null });
    const itemQuery = orderedQuery({ data: [], error: null });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => table === "batch_runs" ? runQuery : itemQuery),
    });

    await expect(getDurableBatchRun({ userId: "user-1", batchId: "batch-1" }))
      .resolves.toEqual({ status: "found", batch: { run, items: [] } });
  });
});
