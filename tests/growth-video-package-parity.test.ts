import { describe, expect, it } from "vitest";
import { buildMasterVideoDistributionPackages } from "@/lib/growth/publishing-package";
import { buildVideoDistributionPackages } from "../supabase/functions/stockbox-growth-worker-api/video-packages";

describe("growth master-video package parity", () => {
  it("keeps app and worker package identity/tracking aligned", () => {
    const input = {
      renderJobId: "job-1",
      contentId: "content-1",
      masterAssetId: "asset-1",
      title: "Tre risker",
      caption: "Kontrollera skuld, kassaflöde och marginaltrend.",
      baseUrl: "https://www.getstockbox.app",
      shadowMode: false,
    };
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
});
