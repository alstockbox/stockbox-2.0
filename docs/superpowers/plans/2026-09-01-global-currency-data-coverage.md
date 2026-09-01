# Global Currency & Data Coverage Hardening — Implementation Plan

Date: 2026-09-01
Target branch: `fix/investor-data-platform-p0-real`

## Task 1 — Lock the reported failures with regression tests

- Preserve existing red/green coverage for historical chart currency.
- Add QA regression proving historical-price currency mismatch prevents a 100% currency-alignment score.
- Add fixtures for SEK, USD, GBp/GBX and one additional non-USD market.
- Add holding-company regression proving generic historical growth/margin/P-E and generic peer multiples are not presented.

## Task 2 — Finish end-to-end historical currency propagation

- Ensure `MarketPricePoint` carries optional quote currency/provider provenance.
- Ensure Yahoo, Twelve Data and Stooq populate it.
- Keep long provider history rather than arbitrary 60-point truncation.
- Ensure chart formatters never default unknown currency to USD.
- Ensure pence quote units are converted only for display using the currency-unit abstraction.

## Task 3 — Connect market-history currency to QA

- Add deterministic history-currency alignment helper.
- Compare every usable price-history point against the current market quote currency in economic-currency terms.
- Treat mixed/conflicting history currencies as an integrity failure.
- Treat unknown currency metadata as incomplete evidence rather than perfect alignment when history is present.
- Feed the result into the existing confidence/QA breakdown without breaking legacy reports.

## Task 4 — Improve real historical coverage without fabrication

- Reuse the existing financial-period merge/reconciliation logic.
- Verify that compatible secondary-provider periods are appended, not discarded.
- Add regression tests for period backfill and field-level supplementation.
- Preserve source conflicts and provenance.
- Do not generate 10Y metrics unless actual dates support the horizon.

## Task 5 — Make coverage archetype-aware

- Confirm holding/investment companies treat industrial growth/margin/P-E metrics as not applicable rather than missing.
- Keep applicable price, balance-sheet and dividend history.
- Keep NAV/SOTP valuation unavailable until verified NAV/look-through data exists.
- Adjust report copy/coverage where necessary so users can distinguish provider-limited data from methodology-inapplicable data.

## Task 6 — Validate Investor-class consistency

- Assert current market price currency and chart currency align for Swedish listings when the provider reports SEK.
- Ensure report-level Currency Alignment cannot be 100% if chart history conflicts.
- Ensure holding-company generic revenue history and generic valuation peers are suppressed.
- Confirm no Investor-specific ticker hacks were introduced.

## Task 7 — Verification and release

Run/trigger:

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

Then inspect CI status/logs, review the full diff against `main`, open a PR, and report remaining source/provider blockers separately from code defects.
