import { describe, expect, it } from "vitest";
import { loadGrowthAdminData, type GrowthAdminDataSource } from "@/lib/growth/admin-growth-data";

function source(overrides: Partial<GrowthAdminDataSource> = {}): GrowthAdminDataSource {
  return {
    getMetrics: async () => [
      { metric_date: "2026-09-04", qualified_unique_visitors: 14, rolling_7d_avg: 10 },
      { metric_date: "2026-09-03", qualified_unique_visitors: 8, rolling_7d_avg: 8 },
      { metric_date: "2026-08-29", qualified_unique_visitors: 4, rolling_7d_avg: 4 },
      { metric_date: "2026-08-28", qualified_unique_visitors: 6, rolling_7d_avg: 5 },
    ],
    getBudgetRows: async () => [
      { estimated_sek: 2, actual_sek: 1.5 },
      { estimated_sek: 0.8, actual_sek: null },
    ],
    getReadyRenderJobs: async () => [
      { id: "job-1", content_id: "content-1", state: "ready", template: "educational_checklist", language: "sv", created_at: "2026-09-04T08:00:00Z", metadata: {} },
      { id: "job-2", content_id: "content-2", state: "ready", template: "educational_checklist", language: "sv", created_at: "2026-09-04T09:00:00Z", metadata: {} },
    ],
    getContents: async () => [
      { id: "content-1", title: "Tre risker", topic: "riskanalys" },
      { id: "content-2", title: "Ingen video", topic: "värdering" },
    ],
    getPassedAssets: async () => [
      { id: "asset-video", render_job_id: "job-1", content_id: "content-1", kind: "master_video", bucket: "growth-ready-assets", storage_path: "ready/job-1/master.mp4", qc_status: "passed" },
      { id: "asset-cover", render_job_id: "job-1", content_id: "content-1", kind: "cover", bucket: "growth-ready-assets", storage_path: "ready/job-1/cover.jpg", qc_status: "passed" },
      { id: "asset-static", render_job_id: null, content_id: "content-1", kind: "static_image", bucket: "growth-ready-assets", storage_path: "ready/content-1/static.png", qc_status: "passed" },
      { id: "bad-video", render_job_id: "job-2", content_id: "content-2", kind: "master_video", bucket: "growth-render-staging", storage_path: "staging/job-2/master.mp4", qc_status: "passed" },
    ],
    getReadyPackages: async () => [
      { id: "pkg-ig", render_job_id: "job-1", content_id: "content-1", platform: "instagram_reel", title: "Tre risker", caption: "Caption", description: null, utm_url: "https://www.getstockbox.app/?utm_source=instagram", recommended_time: "18:30 Europe/Stockholm", daily_rank: 1, status: "ready" },
    ],
    getFounderScripts: async () => [
      { id: "script-1", suggested_for_date: "2026-09-04", hook: "Hook", script: "Manus", screen_directions: "Visa StockBox", caption: "Caption", cta: "Testa StockBox", recommended_platform: "instagram_reel", status: "suggested", expires_at: "2026-09-07T00:00:00Z" },
    ],
    getLearningDecisions: async () => [
      { decision: "Riskanalys gav mest kvalificerad trafik i det lilla datamaterialet.", reason: "Låg sample", supporting_metrics: { sample: 7 }, confidence: 0.35, expected_effect: "v3_shadow_learning", created_at: "2026-09-04T09:00:00Z" },
    ],
    getWorkflowRuns: async () => [
      { workflow: "SB-13-edge-v2", status: "success", detail: { ai: 0, deterministic: 2 }, created_at: "2026-09-04T08:00:00Z" },
    ],
    getErrors: async () => [
      { source: "SB-AI-edge-v2", error_type: "gemini_failure", message: "Gemini 503", occurred_at: "2026-09-04T07:59:00Z" },
    ],
    getLegacyV2Count: async () => 6,
    ...overrides,
  };
}

describe("growth admin data", () => {
  it("shows only READY video jobs that have passed private ready assets and a ready package", async () => {
    const view = await loadGrowthAdminData(source(), new Date("2026-09-04T12:00:00Z"));
    expect(view.readyVideos).toHaveLength(1);
    expect(view.readyVideos[0]).toMatchObject({
      renderJobId: "job-1",
      title: "Tre risker",
      masterAssetId: "asset-video",
      coverAssetId: "asset-cover",
    });
    expect(view.readyVideos[0].packages[0].platform).toBe("instagram_reel");
  });

  it("never embeds storage signed URLs in the founder view model", async () => {
    const view = await loadGrowthAdminData(source(), new Date("2026-09-04T12:00:00Z"));
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("token=");
    expect(serialized).not.toContain("storage_path");
    expect(serialized).not.toContain("master.mp4");
  });

  it("uses actual budget cost when known and estimate otherwise", async () => {
    const view = await loadGrowthAdminData(source(), new Date("2026-09-04T12:00:00Z"));
    expect(view.summary.monthlySpendSek).toBe(2.3);
    expect(view.summary.budgetTargetSek).toBe(50);
    expect(view.summary.budgetHardCapSek).toBe(75);
  });

  it("keeps founder scripts separate from automatic assets and reports legacy v2 count", async () => {
    const view = await loadGrowthAdminData(source(), new Date("2026-09-04T12:00:00Z"));
    expect(view.founderScripts).toHaveLength(1);
    expect(view.founderScripts[0].id).toBe("script-1");
    expect(view.legacyV2Count).toBe(6);
    expect(view.readyVideos.some((video) => video.renderJobId === "script-1")).toBe(false);
  });

  it("classifies recovered provider errors as diagnostics rather than action-required failures", async () => {
    const view = await loadGrowthAdminData(source(), new Date("2026-09-04T12:00:00Z"));
    expect(view.diagnosticsSummary.recovered).toBeGreaterThan(0);
    expect(view.diagnosticsSummary.actionRequired).toBe(0);
  });
});
