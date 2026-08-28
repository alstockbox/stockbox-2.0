import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getP0Copy } from "../../src/lib/i18n/p0-copy";

describe("P0 localization", () => {
  it("provides Swedish copy for core product workflows", () => {
    const sv = getP0Copy("sv");
    expect(sv.nav.analyze).toBe("Analysera");
    expect(sv.auth.email).toBe("E-post");
    expect(sv.analyze.title).toBe("Analysera ett bolag");
    expect(sv.dashboard.title).toBe("Översikt");
    expect(sv.watchlist.title).toBe("Bevakningslista");
    expect(sv.portfolio.title).toBe("Portfölj");
    expect(sv.profile.title).toBe("Profilinställningar");
    expect(sv.billing.title).toBe("Betalning och abonnemang");
    expect(sv.batch.title).toBe("Batchanalys");
    expect(sv.pricing.title).toContain("gratis");
  });

  it("keeps English and Swedish top-level key shapes identical", () => {
    expect(Object.keys(getP0Copy("sv"))).toEqual(Object.keys(getP0Copy("en")));
  });
  it("integrates locale copy into core P0 surfaces", () => {
    const files = [
      "src/components/app-shell/nav.tsx", "src/app/analyze/page.tsx", "src/app/dashboard/page.tsx",
      "src/app/watchlist/page.tsx", "src/app/portfolio/page.tsx", "src/app/onboarding/page.tsx",
      "src/app/settings/profile/page.tsx", "src/app/settings/billing/page.tsx", "src/app/batch/page.tsx", "src/app/pricing/page.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).toMatch(/getP0Copy/);
    }
    expect(readFileSync(resolve(process.cwd(), "src/components/analysis/analysis-workbench.tsx"), "utf8")).toMatch(/locale/);
    expect(readFileSync(resolve(process.cwd(), "src/components/batch/batch-workbench.tsx"), "utf8")).toMatch(/locale/);
  });


  it("classifies batch rate limits before the generic save-failure fallback", () => {
    const svBatch = getP0Copy("sv").batch as unknown as Record<string, string>;
    expect(svBatch.rateLimited).toContain("analysanrop");

    const source = readFileSync(resolve(process.cwd(), "src/components/batch/batch-workbench.tsx"), "utf8");
    const rateLimitBranch = source.indexOf("if (response.status === 429)");
    const genericFailure = source.indexOf("const message =");
    expect(rateLimitBranch).toBeGreaterThan(-1);
    expect(genericFailure).toBeGreaterThan(-1);
    expect(rateLimitBranch).toBeLessThan(genericFailure);
    expect(source).toContain("copy.rateLimited");
    expect(source).toContain('"entitlement" in payload');
    expect(source).toContain("copy.monthlyLimit");
  });

});

it("supports localized Stripe pending and fallback copy", () => {
  const checkout = readFileSync(resolve(process.cwd(), "src/components/billing/checkout-button.tsx"), "utf8");
  const portal = readFileSync(resolve(process.cwd(), "src/components/billing/portal-button.tsx"), "utf8");
  expect(checkout).toMatch(/pendingLabel/);
  expect(checkout).toMatch(/fallbackError/);
  expect(checkout).toMatch(/locale/);
  const pricing = readFileSync(resolve(process.cwd(), "src/app/pricing/page.tsx"), "utf8");
  expect(pricing).toMatch(/locale=\{locale\}/);
  expect(portal).toMatch(/pendingLabel/);
  expect(portal).toMatch(/fallbackError/);
});

it("integrates locale into report rendering", () => {
  const report = readFileSync(resolve(process.cwd(), "src/components/analysis/report-view.tsx"), "utf8");
  const saved = readFileSync(resolve(process.cwd(), "src/app/analysis/[id]/page.tsx"), "utf8");
  expect(report).toMatch(/locale/);
  expect(report).toMatch(/getP0Copy/);
  expect(saved).toMatch(/getLocale/);
  expect(saved).toMatch(/locale=/);
});


it("localizes server auth action responses", () => {
  const form = readFileSync(resolve(process.cwd(), "src/components/auth/auth-form.tsx"), "utf8");
  const actions = readFileSync(resolve(process.cwd(), "src/lib/auth/actions.ts"), "utf8");
  expect(form).toMatch(/name="locale"/);
  expect(actions).toMatch(/getP0Copy/);
  expect(actions).toMatch(/formData\.get\("locale"\)/);
});