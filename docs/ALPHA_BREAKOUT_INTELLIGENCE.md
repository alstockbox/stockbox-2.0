# StockBox Alpha / Breakout Intelligence

## Purpose

StockBox Alpha is a discovery and ranking subsystem layered on top of the existing StockBox fundamental research engine. It is intentionally independent from the fundamental StockBox Score.

The fundamental engine remains responsible for research quality, valuation, profitability, financial health, risk, growth and the normal StockBox research view. Alpha asks a different question: which companies currently show the strongest combination of valuation asymmetry, improving fundamentals, catalysts, momentum confirmation and upside asymmetry after explicit risk gates?

Alpha is a ranking system. It is not a promise of future returns. Probability outputs are model-implied signals that must earn calibration through point-in-time forward outcomes.

## Architecture

The Alpha subsystem lives under `src/lib/alpha` and does not alter `computeScores()` or the fundamental StockBox Score path.

Core components:

- `engine.ts` — independent Alpha ensemble and breakout scoring.
- `report-adapter.ts` — maps existing StockBox facts into Alpha inputs without inventing missing signals.
- `market-cap.ts` — versioned, currency-aware market-cap size policy.
- `weights.ts` — archetype-aware ensemble weights and support penalties.
- `hidden-gems.ts` — category-specific discovery rankings and filters.
- `prediction-snapshot.ts` — immutable point-in-time prediction records.
- `outcomes.ts` — horizon-safe realized outcomes and calibration evaluation.
- `repository.ts` — server-only Alpha persistence and track-record queries.
- `universe.ts` — deterministic official-universe and SEC identity parsers.
- `universe-repository.ts` — official universe refresh, point-in-time membership history and scan queue state.
- `scan-policy.ts` — bounded stale-first selection and failed-security retry backoff.
- `scanner.ts` — server-owned analysis runner that does not consume customer quotas or create customer history rows.
- `outcome-collector.ts` — automated future-price observation for matured predictions.

## Alpha dimensions

The ensemble scores:

1. Undervaluation
2. Business quality
3. Growth acceleration
4. Earnings inflection
5. Catalyst strength
6. Momentum confirmation
7. Estimate revisions
8. Sentiment shift
9. Small-cap asymmetry
10. Breakout probability

The composite Alpha Score remains separate from the fundamental StockBox Score.

## Fundamental acceleration and anti-hype safeguards

The engine emphasizes changes in company economics instead of only static levels. Revenue growth, EPS growth, operating margin and free-cash-flow margin are compared across periods, with forward estimates used when present.

Small size and price momentum are not standalone bullish signals. The model explicitly measures and penalizes financial risk, dilution risk, liquidity risk, excessive momentum detached from fundamentals, weak data coverage and unsupported specialized company archetypes.

The Small-Cap Asymmetry score applies its size benefit only after a fundamental quality gate. The undervaluation ranking combines cheapness with Alpha quality, business quality, growth and financial risk so a statistically cheap deteriorating company does not automatically become a top Hidden Gem.

## Archetype and market-cap policy

Raw market-cap values are never compared across currencies as if they were equivalent. `market-cap.ts` uses a versioned currency-aware policy; unsupported currencies fail closed to `unknown`.

Alpha also applies different signal weights to standard companies, software growth, cyclicals, utilities, banks, insurers, REIT/property companies, asset managers, holding companies and pre-revenue biotech. Specialized archetypes with incomplete Alpha features receive lower support/confidence rather than being forced through the same model as ordinary industrial companies.

## Missing signals are not fabricated

Estimate revisions remain neutral until StockBox has comparable point-in-time analyst-estimate snapshots. A single forward estimate is not a revision.

Sentiment shift remains neutral until a source-backed time-indexed sentiment series exists.

Catalyst strength is populated only from source-backed research events already present in StockBox research.

## Hidden Gems

`/hidden-gems` ranks real point-in-time Alpha snapshots by:

- Highest Breakout Probability
- Top Undervalued
- Small-Cap Opportunities
- Earnings Inflections
- Growth Accelerators
- Catalyst Opportunities
- Most Improved

Filters include horizon, market-cap band and risk band. The latest prediction per ticker is used while the previous snapshot is retained for score-change ranking.

Scanner-created rows are deliberately separate from customer analyses. They do not create fake `/analysis` records and therefore are not linked to a nonexistent analysis detail page.

## Automated US security universe

The scanner universe is server-owned and independent from customer analysis history.

Current automated coverage uses Nasdaq Trader's official symbol-directory feeds:

- `nasdaqlisted.txt`
- `otherlisted.txt`

The parser excludes test issues, ETFs/ETNs, warrants, rights, units, preferred/depositary securities and debt-like instruments. The source file creation timestamp is preserved verbatim because the directory definition does not provide a timezone that StockBox can safely assume.

US identities are enriched, when configured, from the SEC's `company_tickers_exchange.json` directory. The SEC mapping supplies CIK/name/ticker/exchange identity so the existing StockBox provider resolver can use SEC Companyfacts plus Yahoo cross-checking where available.

The scanner must only be described as **US listed-equity discovery coverage**. It is not Nordic/global full-market coverage. Equivalent reliable/licensed universe sources are still required before making those claims.

## Point-in-time universe history

Migration `supabase/migrations/20260901234500_alpha_universe_scanner.sql` adds:

- `alpha_universe_securities`
- `alpha_universe_memberships`
- `alpha_scan_runs`
- universe-backed origins on `alpha_predictions`

Historical source memberships are retained when a listing disappears. A missing security is deactivated for current scanning rather than deleted, preventing silent loss of historical identity.

The universe queue stores last attempt, last successful Alpha scan, failure count and a coarse failure class. Failed securities receive exponential retry backoff so unsupported or temporarily broken symbols cannot block discovery of the rest of the market.

## Scanner behavior

`runAlphaUniverseScan()` uses the same production `analyzeCompany()` pipeline as normal StockBox research but deliberately bypasses:

- customer entitlement reservation
- customer usage counting
- `persistAnalysis()` customer history writes

Scanner predictions are persisted directly to the separate Alpha prediction ledger with `universe_security_id` and `scan_run_id`.

Work is bounded to a hard maximum of 50 names per invocation and executed sequentially. Throughput is increased by recurring invocations instead of uncontrolled provider concurrency.

## Point-in-time prediction ledger

Migration `supabase/migrations/20260901231500_alpha_breakout_intelligence.sql` adds:

- `alpha_predictions`
- `alpha_prediction_outcomes`

Every prediction stores model version, source report model version, prediction timestamp, prediction-time market price, price currency, market-cap band/currency, fundamental score, Alpha Score, breakout score, risk, probabilities, coverage and methodology.

The stored starting price is mandatory for honest forward evaluation: returns are measured from what was actually known when the prediction was emitted, not reconstructed with hindsight.

## Outcome collection and calibration

Evaluation horizons are 30, 90, 180 and 365 days.

`outcomes.ts` rejects observations before a horizon has elapsed and rejects observations outside the configured post-target lag window. `outcome-collector.ts` queries only predictions whose evaluation window is currently mature, fetches real market data and writes outcomes through the same evaluator.

Track-record summaries expose:

- sample count
- P(+25%) hit rate
- mean predicted P(+25%)
- mean realized return
- median realized return
- Brier score for P(+25%) calibration

Benchmark return can also be stored for later excess-return evaluation.

## Automation

`.github/workflows/alpha-intelligence-automation.yml` provides the operational schedule without consuming additional Vercel cron slots:

- official US universe refresh daily
- bounded Alpha scan batches four times per hour
- matured outcome collection daily

Required GitHub Actions secret:

- `STOCKBOX_CRON_SECRET` — must match application `CRON_SECRET`

Optional secret:

- `STOCKBOX_APP_URL` — defaults to `https://www.getstockbox.app`

If `STOCKBOX_CRON_SECRET` is absent the scheduled request step is skipped; no unsecured fallback is used.

Protected endpoints:

- `GET /api/alpha/universe`
- `GET /api/alpha/scan`
- `GET /api/alpha/outcomes`

GET requires bearer `CRON_SECRET`. POST variants require StockBox admin authentication for controlled manual runs.

## What is not claimed yet

This implementation creates the architecture and live-forward measurement loop needed for a serious discovery system. It does **not** establish that StockBox is already the market's best breakout predictor.

That requires sufficient out-of-sample/live observations.

Before making strong performance claims, StockBox still needs:

1. A survivorship-bias-aware historical universe including delisted names for historical research/backtests.
2. Point-in-time analyst estimate history and true revision features.
3. A source-backed sentiment/event time series if sentiment is used.
4. Walk-forward or expanding-window validation using strictly time-valid features.
5. Transaction-cost, spread and liquidity assumptions, especially for micro/small caps.
6. Benchmark-, sector- and market-cap-neutral evaluation.
7. Probability calibration by horizon and market regime once the sample is large enough.
8. Dedicated specialized Alpha features for banks, insurers, REIT/property companies and pre-revenue biotech before increasing their support factors.
9. Reliable/licensed Nordic and global security-universe sources before claiming those markets are exhaustively scanned.

## Production rollout

1. Review and merge the feature branch.
2. Apply `20260901231500_alpha_breakout_intelligence.sql`.
3. Apply `20260901234500_alpha_universe_scanner.sql`.
4. Deploy the application.
5. Add GitHub Actions secret `STOCKBOX_CRON_SECRET` matching production `CRON_SECRET`.
6. Optionally add `STOCKBOX_APP_URL` if production does not use the default StockBox domain.
7. Manually dispatch `StockBox Alpha Intelligence Automation` once to seed the universe and verify protected routes.
8. Open `/hidden-gems` and verify saved-analysis + scanner-backed snapshots appear correctly.
9. Let live forward outcomes accumulate before publishing accuracy claims.

## Non-regression principle

Future Alpha work must preserve the boundary: Alpha may consume normalized facts produced by the existing research engine, but it must not silently modify the fundamental StockBox Score to make predictive rankings look stronger.
