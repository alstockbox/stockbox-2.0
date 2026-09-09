import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("StockBox 2 Upgrade CI dependency triggers", () => {
  it("runs when production dependency manifests change", () => {
    const workflow = readFileSync(
      ".github/workflows/stockbox-2-upgrade-ci.yml",
      "utf8",
    );

    expect(workflow).toMatch(/^\s+-\s+"package\.json"\s*$/m);
    expect(workflow).toMatch(/^\s+-\s+"package-lock\.json"\s*$/m);
  });
});
