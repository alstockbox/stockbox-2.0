# StockBox Analysis Engine Audit

## A. What Existed Before

The workspace originally contained an older private commerce app and a small StockBox V2 foundation. The legacy commerce app has now been removed from active source, tests, migrations, documentation, metadata, package naming, navigation, and app copy.

The remaining StockBox V2 foundation lives under `src/lib/stockbox` with entitlements, investor scoring, analysis, and deterministic paper-trading logic.

No equity analysis engine existed before this slice.

## B. What Was Missing

- Structured company analysis object.
- Sector-aware valuation metric selection.
- Premium/discount calculation against industry, sector, market, peers, and own history.
- Historical valuation percentile logic.
- Sector valuation regime.
- Growth-adjusted and quality-adjusted valuation.
- Premium justification.
- Value trap and expectation risk.
- Data-confidence scoring.
- Beginner presentation and Deep Mode generated from the same core object.
- Tests for stock valuation formulas and missing-data behavior.

## C. Implemented

- `analyzeStock` produces one structured analysis object from deterministic inputs.
- Sector-specific metric applicability covers banks, insurance, REITs, SaaS, semiconductors, mining, industrials, consumer, biotech, and general companies.
- Premium/discount uses a signed framework: `current / benchmark - 1` for lower-is-cheaper multiples, inverted for yield metrics.
- Negative and non-finite valuation metrics are rejected.
- Extreme multiples are excluded from sector metric selection and historical valuation cleaning.
- Historical median and percentile are computed where enough observations exist.
- Sector valuation regime is derived from percentile bands.
- Score explainability separates business quality, valuation attractiveness, and risk.
- For Dummies, Summary, and Deep report text all consume the same structured analysis object.
- A first `/app/analysis` UI page displays the new engine output with progressive disclosure.

## D. Changed Files

- `src/lib/stockbox/analysis-engine.ts`
- `src/lib/stockbox/sample-analysis.ts`
- `src/app/app/analysis/page.tsx`
- `src/app/app/stockbox/page.tsx`
- `src/app/app/stockbox/portfolio/page.tsx`
- `src/app/app/stockbox/thesis/page.tsx`
- `src/app/app/page.tsx`
- `src/components/app/nav.tsx`
- `tests/stockbox/analysis-engine.test.ts`
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `README.md`
- `public/manifest.webmanifest`
- `public/icon.svg`
- `docs/stockbox-analysis-engine-audit.md`

Removed legacy commerce-only files:

- old app routes
- old API routes
- old commerce forms and cards
- old commerce calculation and data-access libraries
- old commerce Supabase migration
- old commerce tests

## E. New Data Models

The new analysis engine introduces TypeScript models for:

- company profile
- current valuation and fundamental metrics
- benchmark sets
- historical metric series
- structured stock analysis
- valuation comparisons
- historical valuation state
- confidence and data freshness
- report-level output

## F. New Calculations

- Premium/discount: `current / benchmark - 1` for normal multiples.
- Yield premium/discount: `benchmark / current - 1`.
- Historical percentile: observations less than or equal to current divided by usable observations.
- Sector valuation regime: percentile bands from Deep Discount to Extreme Premium.
- Weighted scores for business quality, valuation attractiveness, risk, and overall profile.
- Premium justification from growth, quality, cash flow, and balance sheet support.

## G. Data Limitations

The repository still has no live market data provider, fundamentals provider, estimates provider, peer-selection engine, or historical sector valuation database. The engine therefore accepts these as structured inputs and explicitly reports insufficient data instead of fabricating peers, estimates, or history.

Windows/OneDrive currently prevents shell and Node processes from creating new files or removing a few empty legacy directory shells. Those directories contain no files and are not referenced by source, tests, config, or docs.

## H. Recommended Next Steps

- Add a real company/fundamentals data layer.
- Add immutable report snapshots.
- Add batch-analysis storage.
- Add PDF export for For Dummies and Deep reports.
- Add golden company QA fixtures across USA, Sweden, Germany, France, and UK.
- Add full UI flows for searching a ticker and selecting report depth.

## StockBox Analysis Engine Health

- Data Integrity: 6/10
- Valuation Engine: 5/10
- Fundamental Analysis: 4/10
- Beginner Experience: 5/10
- Professional Experience: 4/10
- Explainability: 6/10
- Report Quality: 4/10
- Performance: 7/10
- Reliability: 5/10
- Overall: 5/10
