import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  getCurrentUser: vi.fn(),
  getDurableBatchRun: vi.fn(),
  triggerDurableBatchWorker: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/batch/durable", () => ({ getDurableBatchRun: mocks.getDurableBatchRun }));
vi.mock("@/lib/batch/worker-trigger", () => ({ triggerDurableBatchWorker: mocks.triggerDurableBatchWorker }));

import { GET } from "../../src/app/api/batch/runs/[id]/route";

describe("durable batch status route resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
  });

  it("returns 503 when the durable status store is temporarily unavailable", async () => {
    mocks.getDurableBatchRun.mockResolvedValue({ status: "unavailable" });
    const response = await GET(
      new Request("https://www.getstockbox.app/api/batch/runs/batch-1"),
      { params: Promise.resolve({ id: "batch-1" }) },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Batch status is temporarily unavailable." });
  });

  it("returns 404 only for a successful lookup with no owned batch", async () => {
    mocks.getDurableBatchRun.mockResolvedValue({ status: "not_found" });
    const response = await GET(
      new Request("https://www.getstockbox.app/api/batch/runs/batch-1"),
      { params: Promise.resolve({ id: "batch-1" }) },
    );

    expect(response.status).toBe(404);
  });

  it("preserves the existing self-heal behavior for a found queued batch", async () => {
    mocks.getDurableBatchRun.mockResolvedValue({
      status: "found",
      batch: {
        run: { id: "batch-1", status: "queued" },
        items: [{ status: "queued" }],
      },
    });
    mocks.triggerDurableBatchWorker.mockResolvedValue(true);
    const response = await GET(
      new Request("https://www.getstockbox.app/api/batch/runs/batch-1"),
      { params: Promise.resolve({ id: "batch-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });
});
