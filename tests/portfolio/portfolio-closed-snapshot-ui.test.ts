import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("closed portfolio snapshot UI", () => {
  it("keeps the snapshot action reachable after every active position is sold", () => {
    const page = source("src/app/portfolio/page.tsx");
    const analyzer = source("src/components/portfolio/portfolio-analyzer.tsx");

    const activePositionBranch = page.indexOf("{positions.length ? (");
    const analyzerRender = page.indexOf("<PortfolioAnalyzer");

    expect(activePositionBranch).toBeGreaterThan(-1);
    expect(analyzerRender).toBeGreaterThan(-1);
    expect(analyzerRender).toBeLessThan(activePositionBranch);
    expect(page.match(/<PortfolioAnalyzer/g)).toHaveLength(1);

    expect(analyzer).not.toContain("if (running || !holdings.length) return;");
    expect(analyzer).toContain("if (running) return;");
    expect(analyzer).toContain("Spara slut-snapshot");
    expect(analyzer).toContain("Save final snapshot");
    expect(analyzer).not.toContain("disabled={running || !holdings.length}");
  });
});
