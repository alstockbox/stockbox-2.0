import { describe, expect, it } from "vitest";
import { buildMasterVideoDistributionPackages } from "@/lib/growth/publishing-package";
import {
  buildCompletionVideoPackages,
  buildVideoDistributionPackages,
} from "../supabase/functions/stockbox-growth-worker-api/video-packages";

describe("growth master-video package parity", () => {
  const input = {
    renderJobId: "job-1",
    contentId: "content-1",
    masterAssetId: "asset-1",
    title: "Tre risker",
    caption: "Kontrollera skuld, kassaflöde och marginaltrend.",
    baseUrl: "https://www.getstockbox.app",
    shadowMode: false,
  };

  it("keeps app and worker package identity/tracking aligned", () => {
    const app = buildMasterVideoDistributionPackages(input);
    const edge = buildVideoDistributionPackages(input);

    expect(edge.map((item) => ({
      idempotencyKey: item.idempotency_key,
      platform: item.platform,
      masterAssetId: item.master_asset_id,
      utmUrl: item.utm_url,
      status: item.status,
    }))).toEqual(app.map((item) => ({
      idempotencyKey: item.idempotencyKey,
      platform: item.platform,
      masterAssetId: item.masterAssetId,
      utmUrl: item.utmUrl,
      status: item.status,
    })));
  });

  it("keeps completed video packages in draft unless promotion is explicitly allowed", () => {
    const blocked = buildCompletionVideoPackages({ ...input, promotionAllowed: false });
    expect(blocked).toHaveLength(4);
    expect(blocked.every((item) => item.status === "draft")).toBe(true);

    const promoted = buildCompletionVideoPackages({ ...input, promotionAllowed: true });
    expect(promoted.every((item) => item.status === "ready")).toBe(true);
  });

  it("never promotes while shadow mode is enabled even when the promotion gate passes", () => {
    const packages = buildCompletionVideoPackages({ ...input, shadowMode: true, promotionAllowed: true });
    expect(packages.every((item) => item.status === "draft")).toBe(true);
  });
});
