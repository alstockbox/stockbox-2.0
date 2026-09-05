import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const jobsSource = readFileSync("src/lib/monitoring/jobs.ts", "utf8");

describe("Durable watchlist monitoring V3 policy wiring", () => {
  it("checks policy before querying due watchlists for enqueue", () => {
    const functionIndex = jobsSource.indexOf("export async function enqueueDueWatchlistMonitoringJobs");
    const policyIndex = jobsSource.indexOf("const policy = currentOfficialMonitoringCostDecision()", functionIndex);
    const databaseIndex = jobsSource.indexOf('admin.from("watchlists")', functionIndex);
    expect(policyIndex).toBeGreaterThan(functionIndex);
    expect(databaseIndex).toBeGreaterThan(policyIndex);
    expect(jobsSource.slice(policyIndex, databaseIndex)).toContain("if (!policy.allowed) return");
  });

  it("checks policy before claiming any previously queued background jobs", () => {
    const functionIndex = jobsSource.indexOf("export async function runDurableWatchlistMonitoring");
    const policyIndex = jobsSource.indexOf("const policy = currentOfficialMonitoringCostDecision()", functionIndex);
    const claimIndex = jobsSource.indexOf("runBackgroundJobs({", functionIndex);
    expect(policyIndex).toBeGreaterThan(functionIndex);
    expect(claimIndex).toBeGreaterThan(policyIndex);
    expect(jobsSource.slice(policyIndex, claimIndex)).toContain("pausedReason: policy.reason");
  });

  it("returns zero claimed jobs while monitoring is paused", () => {
    expect(jobsSource).toContain("jobsClaimed: 0");
    expect(jobsSource).toContain('pausedReason?: "background_jobs_killed" | "provider_cost_review_required"');
  });
});
