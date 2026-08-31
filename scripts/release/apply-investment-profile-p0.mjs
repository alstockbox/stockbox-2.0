import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content, "utf8");
}

function replaceOnce(path, from, to, label) {
  const source = read(path);
  const count = source.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  }
  write(path, source.replace(from, to));
}

function replaceCount(path, from, to, expected, label) {
  const source = read(path);
  const count = source.split(from).length - 1;
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} matches in ${path}, found ${count}`);
  }
  write(path, source.split(from).join(to));
}

replaceOnce(
  "src/lib/analysis/types.ts",
  '  | "dividend";\n',
  '  | "dividend"\n  | "defensive";\n',
  "InvestmentProfile union",
);

replaceOnce(
  "src/lib/analysis/config.ts",
  'export const SCORE_POLICY_VERSION = "stockbox-score-policy-v8";',
  'export const SCORE_POLICY_VERSION = "stockbox-score-policy-v9";',
  "score policy version",
);

replaceOnce(
  "src/lib/analysis/config.ts",
  `  dividend: normalizeWeights({
    growth: 0.08,
    profitability: 0.16,
    financialHealth: 0.2,
    valuation: 0.13,
    cashFlow: 0.21,
    earningsQuality: 0.1,
    quality: 0.12,
    momentum: 0.01,
    risk: 0.05,
  }),
  long_term: normalizeWeights({`,
  `  dividend: normalizeWeights({
    growth: 0.08,
    profitability: 0.16,
    financialHealth: 0.2,
    valuation: 0.13,
    cashFlow: 0.21,
    earningsQuality: 0.1,
    quality: 0.12,
    momentum: 0.01,
    risk: 0.05,
  }),
  defensive: normalizeWeights({
    growth: 0.03,
    profitability: 0.08,
    financialHealth: 0.26,
    valuation: 0.05,
    cashFlow: 0.18,
    earningsQuality: 0.14,
    quality: 0.13,
    momentum: 0.01,
    risk: 0.12,
  }),
  long_term: normalizeWeights({`,
  "defensive score weights",
);

replaceOnce(
  "src/lib/profile/actions.ts",
  'const investmentProfileSchema = z.enum(["long_term", "short_term", "growth", "value", "quality", "dividend", "balanced"]);',
  'const investmentProfileSchema = z.enum(["long_term", "short_term", "growth", "value", "quality", "dividend", "defensive", "balanced"]);',
  "profile persistence schema",
);

replaceOnce(
  "src/app/api/analysis/route.ts",
  '.enum(["long_term", "short_term", "growth", "value", "quality", "dividend", "balanced"])',
  '.enum(["long_term", "short_term", "growth", "value", "quality", "dividend", "defensive", "balanced"])',
  "analysis request schema",
);

replaceOnce(
  "src/components/analysis/analysis-workbench-state.ts",
  'const INVESTMENT_PROFILES = new Set<InvestmentProfile>(["long_term", "short_term", "growth", "value", "quality", "dividend", "balanced"]);',
  'const INVESTMENT_PROFILES = new Set<InvestmentProfile>(["long_term", "short_term", "growth", "value", "quality", "dividend", "defensive", "balanced"]);',
  "workbench persisted-profile allowlist",
);

replaceOnce(
  "src/app/onboarding/page.tsx",
  '<option value="balanced">{analysisCopy.balanced}</option><option value="long_term">{analysisCopy.longTerm}</option><option value="short_term">{analysisCopy.shortTerm}</option><option value="growth">{analysisCopy.growth}</option><option value="value">{analysisCopy.value}</option><option value="quality">{analysisCopy.quality}</option><option value="dividend">{analysisCopy.dividend}</option>',
  '<option value="balanced">{analysisCopy.balanced}</option><option value="long_term">{analysisCopy.longTerm}</option><option value="short_term">{analysisCopy.shortTerm}</option><option value="growth">{analysisCopy.growth}</option><option value="value">{analysisCopy.value}</option><option value="quality">{analysisCopy.quality}</option><option value="dividend">{analysisCopy.dividend}</option><option value="defensive">{analysisCopy.defensive}</option>',
  "onboarding defensive option",
);

replaceOnce(
  "src/app/settings/profile/page.tsx",
  '              <option value="dividend">{analysisCopy.dividend}</option>\n',
  '              <option value="dividend">{analysisCopy.dividend}</option>\n              <option value="defensive">{analysisCopy.defensive}</option>\n',
  "profile settings defensive option",
);

replaceOnce(
  "src/components/batch/batch-workbench.tsx",
  '              <option value="dividend">{analyzeCopy.dividend}</option>\n',
  '              <option value="dividend">{analyzeCopy.dividend}</option>\n              <option value="defensive">{analyzeCopy.defensive}</option>\n',
  "batch defensive option",
);

replaceOnce(
  "src/lib/i18n/p0-copy.ts",
  '      value: "Value / valuation", quality: "Quality", dividend: "Dividend", simple: "Simple", pro: "Pro",',
  '      value: "Value / valuation", quality: "Quality", dividend: "Dividend", defensive: "Defensive", simple: "Simple", pro: "Pro",',
  "English defensive copy",
);

replaceOnce(
  "src/lib/i18n/p0-copy.ts",
  '      value: "Värde / värdering", quality: "Kvalitet", dividend: "Utdelning", simple: "Enkelt", pro: "Pro",',
  '      value: "Värde / värdering", quality: "Kvalitet", dividend: "Utdelning", defensive: "Defensiv", simple: "Enkelt", pro: "Pro",',
  "Swedish defensive copy",
);

replaceOnce(
  "src/components/analysis/analysis-workbench.tsx",
  'import { commonCompanies } from "@/lib/data/common-companies";',
  'import { profilePresentationFor } from "@/lib/analysis/profile-presentation";\nimport { commonCompanies } from "@/lib/data/common-companies";',
  "workbench profile presentation import",
);

replaceOnce(
  "src/components/analysis/analysis-workbench.tsx",
  '  const [investmentProfile, setInvestmentProfile] = useState<InvestmentProfile>(initialInvestmentProfile);\n',
  '  const [investmentProfile, setInvestmentProfile] = useState<InvestmentProfile>(initialInvestmentProfile);\n  const profilePresentation = profilePresentationFor(investmentProfile, locale);\n',
  "workbench profile presentation state",
);

replaceOnce(
  "src/components/analysis/analysis-workbench.tsx",
  `          </div>

          <details className="self-start rounded-lg border border-white/10 bg-white/[0.03] p-4">`,
  `            <div data-testid="primary-investment-profile" className="mt-5 rounded-lg border border-[#b99b5f]/25 bg-[#b99b5f]/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-semibold text-[#f4efe5]" htmlFor="investment-profile-primary">{copy.investmentProfile}</label>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#e1cb95]">{copy.investmentProfile}</span>
              </div>
              <select
                id="investment-profile-primary"
                value={investmentProfile}
                onChange={(event) => setInvestmentProfile(event.target.value as InvestmentProfile)}
                className="mt-3 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]"
              >
                <option value="balanced">{copy.balanced}</option>
                <option value="long_term">{copy.longTerm}</option>
                <option value="short_term">{copy.shortTerm}</option>
                <option value="growth">{copy.growth}</option>
                <option value="value">{copy.value}</option>
                <option value="quality">{copy.quality}</option>
                <option value="dividend">{copy.dividend}</option>
                <option value="defensive">{copy.defensive}</option>
              </select>
              <p className="mt-3 text-xs leading-5 text-[#aeb9c8]">{profilePresentation.description}</p>
            </div>
          </div>

          <details className="self-start rounded-lg border border-white/10 bg-white/[0.03] p-4">`,
  "primary investment profile control",
);

replaceOnce(
  "src/components/analysis/analysis-workbench.tsx",
  '            <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">',
  '            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">',
  "advanced settings grid",
);

replaceOnce(
  "src/components/analysis/analysis-workbench.tsx",
  `            <label className="space-y-2 text-sm">
              <span className="font-semibold text-[#f4efe5]">{copy.investmentProfile}</span>
              <select
                value={investmentProfile}
                onChange={(event) => setInvestmentProfile(event.target.value as InvestmentProfile)}
                className="h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]"
              >
                <option value="balanced">{copy.balanced}</option>
                <option value="long_term">{copy.longTerm}</option>
                <option value="short_term">{copy.shortTerm}</option>
                <option value="growth">{copy.growth}</option>
                <option value="value">{copy.value}</option>
                <option value="quality">{copy.quality}</option>
                <option value="dividend">{copy.dividend}</option>
              </select>
            </label>
`,
  "",
  "remove duplicate advanced investment profile control",
);

replaceOnce(
  "src/components/analysis/report-view.tsx",
  'import { buildAnalystExpectationsSummary } from "@/lib/analysis/analyst-expectations";',
  'import { buildAnalystExpectationsSummary } from "@/lib/analysis/analyst-expectations";\nimport { orderScoreDimensions, profilePresentationFor } from "@/lib/analysis/profile-presentation";',
  "report profile presentation import",
);

replaceOnce(
  "src/components/analysis/report-view.tsx",
  '  const copy = getP0Copy(locale).report;\n',
  '  const copy = getP0Copy(locale).report;\n  const profilePresentation = profilePresentationFor(report.investmentProfile, locale);\n  const profileDimensions = orderScoreDimensions(report.score.dimensions, report.investmentProfile);\n',
  "report profile presentation state",
);

replaceOnce(
  "src/components/analysis/report-view.tsx",
  `        </div>
        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">`,
  `        </div>
        <div className="mt-4 rounded-md border border-[#b99b5f]/20 bg-[#b99b5f]/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#e1cb95]">{locale === "sv" ? "Investeringslins" : "Investment lens"} · {report.investmentProfile.replaceAll("_", " ")}</p>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[#c9d2df]">{profilePresentation.description}</p>
        </div>
        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">`,
  "report investment lens summary",
);

replaceCount(
  "src/components/analysis/report-view.tsx",
  '{report.score.dimensions.map((dimension) => (',
  '{profileDimensions.map((dimension) => (',
  2,
  "profile-aware visible score ordering",
);

replaceOnce(
  "src/components/analysis/report-view.tsx",
  '<ScoreChart dimensions={report.score.dimensions} />',
  '<ScoreChart dimensions={profileDimensions} />',
  "profile-aware score chart ordering",
);

const staleProfileEnums = [
  "src/lib/profile/actions.ts",
  "src/app/api/analysis/route.ts",
  "src/components/analysis/analysis-workbench-state.ts",
].filter((path) => read(path).includes('"dividend", "balanced"'));
if (staleProfileEnums.length) {
  throw new Error(`Stale investment-profile allowlists remain: ${staleProfileEnums.join(", ")}`);
}

for (const path of [
  "src/components/analysis/analysis-workbench.tsx",
  "src/components/batch/batch-workbench.tsx",
  "src/app/onboarding/page.tsx",
  "src/app/settings/profile/page.tsx",
]) {
  if (!read(path).includes('value="defensive"')) {
    throw new Error(`Defensive profile option missing from ${path}`);
  }
}

console.log("Investment-profile P0 patch applied with all guards satisfied.");
