import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile analysis and transient menu UX", () => {
  it("uses transient menus instead of sticky native details menus", () => {
    const nav = read("src/components/app-shell/nav.tsx");
    const transientMenu = read("src/components/app-shell/transient-menu.tsx");

    expect(nav).toContain("TransientMenu");
    expect(nav).not.toContain("<details");
    expect(transientMenu).toContain('"use client"');
    expect(transientMenu).toContain("pointerdown");
    expect(transientMenu).toContain('event.key === "Escape"');
    expect(transientMenu).toContain("onMouseLeave");
    expect(transientMenu).toContain("closeMenu");
  });

  it("keeps search choices available after selection but collapses them when Analyze starts", () => {
    const workbench = read("src/components/analysis/analysis-workbench.tsx");

    expect(workbench).toContain("const [showSearchResults, setShowSearchResults] = useState(true)");
    expect(workbench).toContain("setShowSearchResults(true)");
    expect(workbench).toMatch(/function runAnalysis\(\)[\s\S]*setShowSearchResults\(false\)[\s\S]*fetch\("\/api\/analysis"/);
    expect(workbench).toContain("showSearchResults && results.length > 0");
  });

  it("offers a one-tap clear control and a mobile-first Analyze CTA beside profile selection", () => {
    const workbench = read("src/components/analysis/analysis-workbench.tsx");

    expect(workbench).toContain("function clearSearch()");
    expect(workbench).toContain('aria-label={locale === "sv" ? "Rensa sökning" : "Clear search"}');
    expect(workbench).toContain('data-testid="mobile-analysis-cta"');
    expect(workbench).toContain("sm:hidden");
    expect(workbench).toContain("sticky bottom-3");
  });

  it("uses tighter mobile spacing without degrading desktop spacing", () => {
    const workbench = read("src/components/analysis/analysis-workbench.tsx");
    expect(workbench).toContain('className="space-y-4 sm:space-y-6"');
    expect(workbench).toContain('className="p-4 sm:p-5"');
  });
});
