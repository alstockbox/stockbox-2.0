import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "src/app/admin/page.tsx"), "utf8");

describe("admin ambassador operations UI", () => {
  it("includes the create ambassador workflow", () => {
    expect(page).toContain("AmbassadorCreateForm");
    expect(page).toContain("Add ambassador");
  });

  it("includes a safe affiliate dashboard preview", () => {
    expect(page).toContain("/affiliate?preview=");
    expect(page).toContain("View dashboard");
  });

  it("lets admin change quota and commission", () => {
    expect(page).toContain("updateAmbassadorAction");
    expect(page).toContain("monthlyAnalysisLimit");
    expect(page).toContain("commissionPercent");
  });
});