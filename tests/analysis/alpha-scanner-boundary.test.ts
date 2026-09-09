import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scannerPath = join(process.cwd(), "src/lib/alpha/scanner.ts");
const repositoryPath = join(process.cwd(), "src/lib/alpha/repository.ts");
const collectorPath = join(process.cwd(), "src/lib/alpha/outcome-collector.ts");

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Alpha server-owned scanner boundary", () => {
  it("runs the analysis provider directly and persists only into the Alpha ledger", () => {
    expect(existsSync(scannerPath)).toBe(true);
    if (!existsSync(scannerPath)) return;
    const scanner = source(scannerPath);

    expect(scanner).toContain('from "../data/enhanced-provider"');
    expect(scanner).toContain('from("alpha_predictions")');
    expect(scanner).not.toMatch(/reserveAnalysis|analysis_quota|persistAnalysis|from\(["']analyses["']\).*insert/s);
  });

  it("keeps materialization and outcomes on the service-role Alpha repository", () => {
    expect(existsSync(repositoryPath)).toBe(true);
    expect(existsSync(collectorPath)).toBe(true);
    if (!existsSync(repositoryPath) || !existsSync(collectorPath)) return;

    const repository = source(repositoryPath);
    const collector = source(collectorPath);
    expect(repository).toContain('from("alpha_predictions")');
    expect(repository).toContain('from("alpha_prediction_outcomes")');
    expect(collector).toContain("recordAlphaPredictionOutcome");
    expect(collector).not.toMatch(/persistAnalysis|analysis_quota|reserveAnalysis/);
  });
});