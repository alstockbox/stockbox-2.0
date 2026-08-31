import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const customerSurfaces = [
  "src/app/page.tsx", "src/components/analysis/report-view.tsx", "src/app/history/page.tsx",
  "src/app/dashboard/page.tsx", "src/app/analyze/page.tsx", "src/app/compare/page.tsx",
  "src/components/analysis/comparison-picker.tsx", "src/components/batch/batch-workbench.tsx",
  "src/lib/batch/export.ts", "src/lib/i18n/marketing-copy.ts",
];

describe("neutral customer research language", () => {
  it("does not render direct buy/hold/sell labels on customer surfaces", () => {
    for (const path of customerSurfaces) {
      const source = read(path);
      expect(source, path).not.toMatch(/>\s*(?:Strong Buy|Buy|Hold|Sell|Strong Sell)\s*</);
      // Canonical model ratings may be displayed, but only with neutral product language.
      if (/\b(?:report|analysis|item)(?:\?\.)?\.recommendation|row\.report\?\.recommendation/.test(source)) {
        expect(source, path).toMatch(/Model rating|Modellbedömning|copy\.recommendation|Research view|Researchvy/);
      }
    }
  });
});
