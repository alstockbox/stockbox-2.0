# StockBox Global Currency & Data Coverage Hardening — Design

Date: 2026-09-01
Branch: `fix/investor-data-platform-p0-real`

## Problem statement

The Investor AB report exposed a class of systemic issues rather than one issuer-specific defect:

- Historical chart values inherited the correct numeric market prices but lost the quote currency before rendering, allowing the UI to label SEK prices as USD.
- Currency QA could report 100% alignment because it only reconciled valuation inputs and did not validate the rendered historical price series.
- Market-history fallback providers truncated or failed to preserve currency metadata, limiting long-horizon charts and making fallbacks unsafe.
- Holding/investment companies were scored with specialized methodology, but generic operating-company historical and peer modules could still appear in the UI.
- Long historical financial coverage depends heavily on upstream provider depth. The resolver already merges SEC and Yahoo for supported US companies, but the product needs clearer coverage semantics, stronger provider/backfill behavior, and fail-closed treatment where source data truly does not exist.

## Goals

1. Every monetary market datapoint carries quote currency metadata end-to-end where the provider supplies it.
2. Price charts never invent USD, SEK, or another currency. Missing or conflicting currency metadata must fail closed or render without a currency label.
3. Quote units such as GBp/GBX are normalized correctly for display while retaining their source quote semantics.
4. Market history should preserve the longest verified provider history available rather than truncating to a fixed 60-point window.
5. Holding/investment-company UI must suppress generic metrics that the scoring methodology considers unsuitable.
6. Currency QA must account for historical/render-facing market data so a report cannot claim 100% currency alignment while showing a conflicting chart currency.
7. Historical/coverage reporting must distinguish true source limitations from not-applicable archetype metrics and must never inflate completeness.
8. Provider fallback/backfill should merge compatible financial periods/fields rather than discarding useful secondary-provider history.

## Non-goals

- Fabricating NAV/SOTP, analyst estimates, ownership, insider or segment data when no verified source is available.
- Hardcoding Investor AB or `.ST => SEK` as the source of truth. Exchange/ticker heuristics may be sanity checks only; provider/security-master metadata remains authoritative.
- Claiming universal 10-year fundamentals where upstream providers do not supply ten verified annual periods.

## Architecture

### Typed market history

`MarketPricePoint` carries `currency` and optional provider provenance. Provider adapters populate that metadata when available. Rendering uses the point currency rather than a component default.

### Currency-safe rendering

Historical chart formatting uses the existing currency-unit abstraction. Unknown currency => numeric display without a currency symbol. GBp/GBX quote values are converted to GBP display values using the declared quote scale.

### Market-history fallback

Yahoo, Twelve Data and Stooq histories retain currency metadata. Twelve Data keeps the long requested history instead of slicing to 60 records. Stooq history is retained as a fallback where available.

### Archetype gating

Holding/investment companies suppress generic revenue/margin/P-E historical modules and generic peer-multiple comparisons. Suitable price, balance-sheet and verified dividend history can remain. NAV/SOTP-dependent valuation stays unavailable until sourced.

### QA integrity

Currency alignment becomes the combination of:

- normalized valuation/input currency consistency; and
- historical market-series quote currency consistency against the current market quote/trading currency.

A mismatched price-history currency is a hard integrity failure. Unknown history currency cannot support a 100% currency-alignment claim when price history is being used.

### Coverage semantics

Coverage must preserve three states: available, unavailable, and not applicable. Archetype-inappropriate metrics are not counted as missing. Historical horizon labels are driven by actual observation span. No 4-year history is relabeled as 10 years.

### Fundamental backfill

The resolver continues to reconcile same-period SEC/Yahoo data field-by-field and appends compatible secondary-provider periods. Any new backfill must preserve currency identity, period basis, provenance and conflict diagnostics.

## Verification matrix

- `INVE-B.ST`: SEK history; holding-company generic history and peer multiples suppressed; currency QA cannot remain 100% on a conflicting series.
- `AAPL`: USD history preserved; operating-company history remains visible.
- London security quoted in GBp/GBX: quote values display as GBP with 0.01 scale.
- Additional non-USD market fixture (JPY/CHF/SEK): no USD fallback.
- Legacy history point with unknown currency: never rendered as USD.
- Multi-provider financial history: compatible missing fields/periods backfilled; conflicts retained and surfaced.

## Release policy

Currency mismatch is P0. The report must fail closed rather than render a knowingly mislabelled monetary series. Missing source data remains missing with an explicit reason; coverage is improved by real backfill only, never by synthetic values.
