import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("closed portfolio performance summary", () => {
  it("keeps financial snapshot metrics visible when every active position is closed", () => {
    const page = source("src/app/portfolio/page.tsx");

    const analyzerRender = page.indexOf("<PortfolioAnalyzer");
    const activePositionBranch = page.indexOf("{positions.length ? (", analyzerRender);
    const financialLabels = [
      "Portföljvärde",
      "Investerat kapital",
      "Realiserat P/L",
      "Orealiserat P/L",
      "Utdelningar",
      "Avgifter",
      "Totalt P/L",
    ];

    expect(analyzerRender).toBeGreaterThan(-1);
    expect(activePositionBranch).toBeGreaterThan(analyzerRender);

    for (const label of financialLabels) {
      const labelIndex = page.indexOf(label, analyzerRender);
      expect(labelIndex, `${label} must render before the active-position-only branch`).toBeGreaterThan(analyzerRender);
      expect(labelIndex, `${label} must remain visible for a closed historical ledger`).toBeLessThan(activePositionBranch);
    }

    const financialSection = page.slice(analyzerRender, activePositionBranch);
    expect(financialSection).toContain("{latest ? (");
    expect(financialSection).not.toContain("StockBox Portfolio Score");
    expect(page.indexOf("StockBox Portfolio Score", activePositionBranch)).toBeGreaterThan(activePositionBranch);
  });
});
