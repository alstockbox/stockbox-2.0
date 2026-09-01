# StockBox Alpha / Breakout Intelligence

## Purpose

StockBox Alpha is a discovery and ranking subsystem layered on top of the existing StockBox fundamental research engine. It is intentionally independent from the fundamental StockBox Score.

The fundamental engine remains responsible for research quality, valuation, profitability, financial health, risk, growth and the normal StockBox research view. Alpha answers a different question: which companies currently show the strongest combination of valuation asymmetry, improving fundamentals, catalysts, momentum confirmation and upside asymmetry, after explicit risk gates?

Alpha is a ranking system. It is not a promise of future returns and its probability outputs are model-implied signals that must earn calibration through point-in-time forward outcomes.

## Architecture

The Alpha subsystem lives under `src/lib/alpha` and does not alter the existing `computeScores()` / fundamental score path.

Core components:

- `engine.ts` — independent Alpha ensemble and breakout scoring.
- `report-adapter.ts` — maps existing StockBox report facts into Alpha inputs without fabricating unavailable data.
- `market-cap.ts` — versioned, currency-aware market-cap size policy.
- `weights.ts` — archetype-aware ensemble weights and support penalties.
- `hidden-gems.ts` — category-specific discovery rankings and filters.
- `prediction-snapshot.ts` — immutable point-in-time prediction records.
- `outcomes.ts` — horizon-safe realized outcome and calibration evaluation.
- `repository.ts` — server-only persistence/materialization and track-record queries.

## Alpha dimensions

The current ensemble scores:

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

The composite Alpha Score is separate from the StockBox fundamental score.

## Fundamental acceleration

The engine emphasizes changes in company economics instead of only static levels. Historical revenue growth, EPS growth, operating margin and free-cash-flow margin are compared across periods, with forward estimates used when present.

A company with improving revenue growth, expanding margins and accelerating EPS/FCF should rank above an otherwise similar company whose latest absolute figures look acceptable but are deteriorating.

## Anti-hype and value-trap safeguards

Small size and price momentum are not treated as standalone bullish signals.

The model explicitly measures and penalizes:

- financial risk
- dilution risk
- liquidity risk
- excessive momentum that has detached from fundamentals (hype risk)
- low data coverage
- unsupported/specialized company archetypes

The Small-Cap Asymmetry score applies its size benefit only when the underlying fundamental opportunity clears a quality gate. Thin liquidity also reduces the score.

The undervaluation ranking combines cheapness with Alpha quality, business quality, growth and financial risk so a statistically cheap but deteriorating company does not automatically become a top Hidden Gem.

## Currency-aware market-cap policy

Raw market-cap numbers are never compared across currencies as if they were equivalent. `market-cap.ts` uses a versioned policy with direct thresholds for supported trading currencies. Missing or unsupported currencies fail closed to `unknown` rather than receiving an invented size classification.

This policy is deliberately versioned so historical predictions can be reproduced against the same size rules.

## Archetype-aware ensemble

StockBox already classifies companies into analysis archetypes. Alpha uses different signal weights for archetypes including standard companies, software growth, cyclicals, utilities, banks, insurers, REIT/property companies, asset managers, holding companies and pre-revenue biotech.

Where the generic Alpha feature set is not yet sufficient for a specialized company type, an explicit support factor reduces Alpha confidence and applies a specialization penalty. This is preferable to pretending a generic P/E/margin model is equally valid for a bank, REIT and pre-revenue biotech company.

## Missing signals are not fabricated

Estimate revisions remain neutral until StockBox has comparable point-in-time analyst-estimate snapshots. A single forward estimate is not treated as a revision.

Sentiment shift remains neutral until StockBox has a source-backed and time-indexed sentiment series that can be evaluated out of sample.

Catalyst strength is populated only from source-backed research events already present in the StockBox report.

## Hidden Gems

`/hidden-gems` exposes the current discovery layer. Ranking categories include:

- Highest Breakout Probability
- Top Undervalued
- Small-Cap Opportunities
- Earnings Inflections
- Growth Accelerators
- Catalyst Opportunities
- Most Improved

Current filters include horizon, market-cap band and risk band. The ranking uses the latest prediction per ticker while preserving the previous snapshot to calculate score changes.

### Current universe limitation

The current implementation materializes Alpha predictions from saved StockBox analyses. Therefore the Hidden Gems universe is the set of companies StockBox has actually analyzed and saved, not the entire listed market.

The UI discloses this explicitly and must not market the current ranking as an exhaustive market-wide scanner.

A true market-wide scanner is a separate ingestion/orchestration layer: it needs a stable security universe, scheduling, rate-limit/cost controls, delisting handling and point-in-time data retention before it should feed production rankings.

## Point-in-time prediction ledger

The migration `supabase/migrations/20260901231500_alpha_breakout_intelligence.sql` adds:

- `alpha_predictions`
- `alpha_prediction_outcomes`

Every Alpha prediction stores the exact model version, source report model version, prediction timestamp, start price, price currency, market-cap currency/band, fundamental StockBox score, Alpha score, breakout score, risk, probability curve, coverage and methodology.

The stored start price is important: future performance is measured from what was actually known when the prediction was made, not reconstructed with hindsight.

## Outcome and calibration rules

Supported evaluation horizons are 30, 90, 180 and 365 days.

An outcome is rejected if the requested horizon has not elapsed. By default, the observation must fall between the target horizon date and seven days after it, allowing for weekends/market closures without accepting arbitrary later prices.

Track-record summaries can report:

- sample count
- P(+25%) hit rate
- mean predicted P(+25%)
- mean realized return
- median realized return
- Brier score for P(+25%) calibration

Benchmark return can also be stored per observation for later excess-return analysis.

## What is not claimed yet

This implementation creates the production architecture needed to become a strong predictive discovery system. It does **not** establish that StockBox is already the best breakout predictor in the market.

That claim would require evidence from properly constructed out-of-sample tests and live forward results.

Before making performance claims, StockBox should add and validate:

1. A survivorship-bias-aware, point-in-time security universe including delisted names.
2. Point-in-time analyst estimate history and revision features.
3. A source-backed sentiment/event time series if sentiment is used.
4. A production universe scanner with deterministic snapshot timestamps.
5. Walk-forward / expanding-window backtests with strictly time-valid features.
6. Transaction-cost, spread and liquidity assumptions, especially for micro/small caps.
7. Benchmark, sector-neutral and market-cap-neutral evaluation.
8. Probability calibration by horizon and market regime.
9. Dedicated specialized features for banks, insurers, REIT/property companies and pre-revenue biotech before raising their archetype support.
10. A scheduled outcome evaluator that records future prices only after each prediction horizon matures.

## Rollout

1. Review and merge the feature branch.
2. Apply `20260901231500_alpha_breakout_intelligence.sql` to the production Supabase project.
3. Deploy the application.
4. Open `/hidden-gems`; existing saved analyses will be materialized into the current Alpha model version.
5. Start accumulating immutable prediction snapshots.
6. Connect a scheduled market-data outcome evaluator for matured horizons.
7. Expand the analyzed universe before treating Hidden Gems as a market-wide discovery product.

## Non-regression principle

Any future Alpha work should preserve the same boundary: Alpha may consume normalized facts produced by the existing research engine, but it must not silently modify the fundamental StockBox Score to make predictive rankings look stronger.
