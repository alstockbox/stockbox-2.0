import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workbench = readFileSync(join(process.cwd(), "src/components/analysis/analysis-workbench.tsx"), "utf8");
const copy = readFileSync(join(process.cwd(), "src/lib/i18n/p0-copy.ts"), "utf8");

describe("analysis first-value UX", () => {
  it("keeps expert configuration behind an advanced settings disclosure", () => {
    expect(workbench).toContain("<details");
    expect(workbench).toContain("copy.advancedSettings");
    expect(copy).toContain('advancedSettings: "Advanced settings"');
    expect(copy).toContain('advancedSettings: "Avancerade inst\\u00e4llningar"');
    expect(copy).not.toContain("Avancerade inst?llningar");
  });
});
