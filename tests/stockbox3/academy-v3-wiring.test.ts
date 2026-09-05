import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overview = readFileSync("src/app/academy/page.tsx", "utf8");
const lesson = readFileSync("src/app/academy/[lessonId]/page.tsx", "utf8");
const action = readFileSync("src/lib/academy/actions-v3.ts", "utf8");
const repository = readFileSync("src/lib/academy/progress-repository-v3.ts", "utf8");
const recommendation = readFileSync("src/lib/analysis/recommendation-v3.ts", "utf8");
const nav = readFileSync("src/components/app-shell/nav.tsx", "utf8");
const dashboard = readFileSync("src/app/dashboard/page.tsx", "utf8");
const mobileNav = readFileSync("src/components/app-shell/mobile-bottom-nav.tsx", "utf8");

describe("Academy V3 wiring", () => {
  it("dark-gates Academy pages before authenticated data is loaded", () => {
    const overviewGate = overview.indexOf('if (!isFeatureEnabled("academy")) notFound()');
    const overviewUser = overview.indexOf("requireUser()");
    const lessonGate = lesson.indexOf('if (!isFeatureEnabled("academy")) notFound()');
    const lessonUser = lesson.indexOf("requireUser()");
    expect(overviewGate).toBeGreaterThan(-1);
    expect(overviewUser).toBeGreaterThan(overviewGate);
    expect(lessonGate).toBeGreaterThan(-1);
    expect(lessonUser).toBeGreaterThan(lessonGate);
  });

  it("gates Investor Score independently from Academy content", () => {
    expect(overview).toContain('isFeatureEnabled("investorScore")');
    expect(overview).toContain("deriveInvestorScoreV3");
    expect(dashboard).toContain('const investorScoreEnabled = isFeatureEnabled("investorScore")');
    expect(dashboard).toContain("investorScoreEnabled ?");
  });

  it("only exposes Academy navigation behind the academy feature flag", () => {
    const flagIndex = nav.indexOf('const academyEnabled = isFeatureEnabled("academy")');
    const desktopLinkIndex = nav.indexOf('href="/academy"');
    expect(flagIndex).toBeGreaterThan(-1);
    expect(desktopLinkIndex).toBeGreaterThan(flagIndex);
    expect(nav.slice(flagIndex, desktopLinkIndex)).toContain("academyEnabled ?");
    expect(nav).toContain("user && academyEnabled ?");
  });

  it("only exposes the Academy dashboard CTA behind the academy feature flag", () => {
    const flagIndex = dashboard.indexOf('const academyEnabled = isFeatureEnabled("academy")');
    const linkIndex = dashboard.indexOf('href="/academy"');
    expect(flagIndex).toBeGreaterThan(-1);
    expect(linkIndex).toBeGreaterThan(flagIndex);
    expect(dashboard.slice(flagIndex, linkIndex)).toContain("academyEnabled ?");
  });

  it("preserves the five existing mobile primary-navigation slots", () => {
    expect(mobileNav).not.toContain('href: "/academy"');
    expect(mobileNav).toContain("grid-cols-5");
    for (const href of ["/dashboard", "/analyze", "/portfolio", "/history", "/settings"]) {
      expect(mobileNav).toContain(`href: "${href}"`);
    }
  });

  it("keeps Academy entry points recommendation-neutral", () => {
    const relevant = `${overview}\n${dashboard}\n${nav}`;
    expect(relevant).not.toContain('name="personalizedScore"');
    expect(relevant).not.toContain('name="userMatchScore"');
    expect(relevant).not.toContain('name="personalizedRating"');
    expect(overview).toContain("påverkar aldrig StockBox objektiva rating, rekommendation eller User Match");
    expect(overview).toContain("never affects StockBox objective ratings, recommendations or User Match");
  });

  it("only accepts lesson id and question answers from the browser", () => {
    expect(action).toContain('formData.get("lessonId")');
    expect(action).toContain('formData.get(`answer:${question.id}`)');
    expect(action).toContain("gradeAcademyQuizV3(lesson.id, answers)");
    expect(action).not.toContain('formData.get("score")');
    expect(action).not.toContain('formData.get("passed")');
    expect(action).not.toContain('formData.get("bestScore")');
  });

  it("persists only the server-computed grade through service-role repository code", () => {
    expect(action).toContain("score: grade.score");
    expect(action).toContain("passed: grade.passed");
    expect(repository).toContain('rpc("record_academy_attempt_v3"');
    expect(repository).toContain("p_score: input.score");
    expect(repository).toContain("p_passed: input.passed");
  });

  it("does not expose correct-answer keys from Academy pages", () => {
    expect(overview).not.toContain("ANSWER_KEY_V3");
    expect(lesson).not.toContain("ANSWER_KEY_V3");
    expect(lesson).not.toContain("gradeAcademyQuizV3");
  });

  it("keeps Recommendation V3 independent from Academy and Investor Score", () => {
    expect(recommendation).not.toContain("academy");
    expect(recommendation).not.toContain("InvestorScore");
    expect(recommendation).not.toContain("investorScore");
  });
});
