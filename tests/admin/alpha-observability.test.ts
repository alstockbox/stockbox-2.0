import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const alphaAdminPath = join(process.cwd(), "src/app/admin/alpha/page.tsx");

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Alpha admin observability boundary", () => {
  it("requires admin before service-role Alpha reads", () => {
    expect(existsSync(alphaAdminPath)).toBe(true);
    if (!existsSync(alphaAdminPath)) return;

    const page = source(alphaAdminPath);
    const auth = page.indexOf("await requireAdmin()");
    const adminClient = page.indexOf("createAdminClient()");

    expect(auth).toBeGreaterThanOrEqual(0);
    expect(adminClient).toBeGreaterThan(auth);
    expect(page).toContain('from("alpha_scan_runs")');
    expect(page).toContain('from("alpha_universe_securities")');
    expect(page).toContain('from("alpha_predictions")');
    expect(page).toContain('from("alpha_prediction_outcomes")');
    expect(page).not.toMatch(/createBrowserClient|createClientComponentClient|NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("renders bounded operational views instead of unbounded Alpha ledgers", () => {
    expect(existsSync(alphaAdminPath)).toBe(true);
    if (!existsSync(alphaAdminPath)) return;

    const page = source(alphaAdminPath);
    expect(page).toMatch(/alpha_scan_runs[\s\S]*?\.limit\(20\)/);
    expect(page).toMatch(/alpha_universe_securities[\s\S]*?\.limit\(20\)/);
    expect(page).toMatch(/alpha_predictions[\s\S]*?\.limit\(20\)/);
    expect(page).toMatch(/alpha_prediction_outcomes[\s\S]*?\.limit\(20\)/);
    expect(page).not.toMatch(/runAlphaUniverseScan|collectMaturedAlphaOutcomes/);
  });

  it("surfaces telemetry query failures instead of presenting zeroes as healthy data", () => {
    expect(existsSync(alphaAdminPath)).toBe(true);
    if (!existsSync(alphaAdminPath)) return;

    const page = source(alphaAdminPath);
    expect(page).toContain("telemetryErrorCount");
    expect(page).toMatch(/\.error/g);
    expect(page).toContain("Alpha telemetry healthy");
    expect(page).toContain("telemetry queries failed");
  });
});
