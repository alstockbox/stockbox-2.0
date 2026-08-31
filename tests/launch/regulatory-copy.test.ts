import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("research-first regulatory copy", () => {
  it("uses research-ready and profile-weighted customer language", () => {
    const reportCopy = read("src/lib/i18n/report-copy.ts");
    const dictionaries = read("src/lib/i18n/dictionaries.ts");
    const recommendation = read("src/lib/analysis/recommendation.ts");
    expect(reportCopy).toContain('personalizedScore: "Profile-weighted score"');
    expect(reportCopy).not.toContain('personalizedScore: "Personalized score"');
    expect(dictionaries).not.toMatch(/decision-ready/i);
    expect(dictionaries).not.toContain('personalizedScore: "Personalized score"');
    expect(recommendation).not.toContain("Personalized model score is");
    expect(recommendation).toContain("Profile-weighted model score is");
  });
});
