import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/analysis-coverage-live-gate.yml";
const corpusPath = "scripts/diagnostics/data/global_etf_investment_tickers_20000.txt";
const materializerPath = "scripts/diagnostics/materialize-global-audit-corpus.mjs";
const expectedSha256 = "b4a63edf1564459dd849724f736145dd0ceb896cf178ec69994a9bebafc71e91";
const liveAuditTestName = "captures classified per-ticker diagnostics for the requested release-hardening list";

function parseTickers(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

describe("global 20k analysis coverage workflow", () => {
  it("materializes and pins the exact 20,000-ticker audit corpus", () => {
    rmSync(corpusPath, { force: true });
    execFileSync(process.execPath, [materializerPath, corpusPath], { stdio: "pipe" });

    expect(existsSync(corpusPath)).toBe(true);
    const raw = readFileSync(corpusPath);
    const tickers = parseTickers(raw.toString("utf8"));

    expect(tickers).toHaveLength(20_000);
    expect(new Set(tickers).size).toBe(20_000);
    expect(createHash("sha256").update(raw).digest("hex")).toBe(expectedSha256);
  });

  it("runs the exact corpus in a bounded parallel matrix and gates only the merged global audit", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("matrix:");
    expect(workflow).toMatch(/max-parallel:\s*[234]/);
    expect(workflow).toContain(`node ${materializerPath} ${corpusPath}`);
    expect(workflow).toContain(`STOCKBOX_TICKER_FILE: ${corpusPath}`);
    expect(workflow).toContain("STOCKBOX_BATCH_LIMIT:");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("actions/download-artifact@v4");
    expect(workflow).toContain("merge-global-audit-shards.mjs");
    expect(workflow).toContain("global-audit-merged.json");
    expect(workflow).toContain("evaluate-global-audit-gate.mjs .stockbox-diagnostics/global-audit-merged.json");

    const gateInvocations = workflow.match(/evaluate-global-audit-gate\.mjs/g) ?? [];
    expect(gateInvocations).toHaveLength(1);
  });

  it("isolates the live shard audit from env-mutating unit tests", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain(`-t "${liveAuditTestName}"`);
  });
});
