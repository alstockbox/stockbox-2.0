# StockBox Release Analysis Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make StockBox analysis safe, globally coherent, recoverable, and product-ready for affiliate/public access before the 31 August release.

**Architecture:** Keep the current deterministic analysis engine and safety gates. Fix data identity, reporting-contract, diagnostics privacy, saved-analysis retrieval, and ambassador entitlement gaps around the engine without loosening score/rating thresholds. Every behavior change is test-first and must preserve missing-data > fabricated-data.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Supabase/Postgres, Stripe, Yahoo/SEC/provider orchestration.

**Spec:** Approved 2026-08-28 hybrid release design from the StockBox parity/release audit; supporting repo docs: `docs/FEATURE_MATRIX.md`, `docs/LAUNCH_CHECKLIST.md`, `docs/SECURITY.md`.

## Global Constraints

- Never tune thresholds to make a named company receive a preferred rating.
- Missing data must remain unavailable rather than inferred without an auditable rule.
- Preserve every existing local change; never reset, restore, clean, or stash the worktree.
- Official 25-company calibration batch remains deferred until pre-release gates are green.
- Public/user-readable telemetry must never contain raw provider or database exception text.
- Global currency labels must come from explicit report data, never a USD UI default.

---### Task 1: Canonical US ticker de-duplication

**Files:**
- Modify: `src/lib/data/company-search.ts`
- Modify: `tests/data/company-search.test.ts`

**Interfaces:**
- Consumes: `searchCompanyCatalog(query, providers)` and existing stable security identifiers.
- Produces: one exact candidate for duplicate bare US tickers while preserving ADR/local/share-class distinctions.

- [ ] Add a regression where SEC and Yahoo both return `WMT` and expect one exact `WMT` with the SEC CIK retained.
- [ ] Run `npm test -- tests/data/company-search.test.ts` and confirm the new regression fails on the current branch.
- [ ] Add `isUsListing()` and extend `canonicalListingMergeKey()` to merge bare US tickers only; reject merge on conflicting CIK/ISIN/FIGI/MIC/country.
- [ ] Add a Roche regression proving retired `ROG.SW` is not exposed as a current exact listing and `RO.SW` remains canonical.
- [ ] Run the company-search suite and require all tests green.

### Task 2: Explicit report currency contract

**Files:**
- Modify: `src/lib/analysis/types.ts`
- Modify: `src/lib/analysis/engine.ts`
- Modify: `src/components/analysis/report-view.tsx`
- Test: `tests/analysis/canonical-export-surface.test.ts`
- Test: `tests/analysis/report-consistency.test.ts`

**Interfaces:**
- Produces: `AnalysisReport.reportingCurrency?: string | null` populated from verified financial/reporting currency.
- UI currency metrics consume only this field or explicit DCF currency; no implicit USD default for financial statement amounts.
- [ ] Add a failing report-surface test with a SEK-report and assert FCF/net debt formatting uses `SEK`, not `$`.
- [ ] Run targeted tests and confirm failure before production changes.
- [ ] Thread verified reporting currency from engine input into `AnalysisReport`.
- [ ] Update report rendering to pass `report.reportingCurrency` into compact-currency formatting.
- [ ] Keep DCF scenario currency explicit and independent from statement currency when the engine reports a mismatch.
- [ ] Run targeted report/export tests and keep them green.

### Task 3: Sanitize user-readable diagnostics and minimize analytics

**Files:**
- Create: `src/lib/security/diagnostics.ts`
- Modify: `src/app/api/analysis/route.ts`
- Modify: `src/app/api/companies/search/route.ts`
- Test: `tests/analysis/route.test.ts`
- Test: `tests/data/company-search-route.test.ts`

**Interfaces:**
- Produces: `publicDiagnosticCode(error: unknown): string` returning a bounded non-secret category/code.
- User `usage_events` stores error code/stage only; privileged logs may store a separately sanitized message.
- Company-search analytics stores `queryLength` and `resultCount`, never raw free-text query.

- [ ] Add tests proving provider strings containing token-like secrets never appear in user-readable usage metadata.
- [ ] Add a test proving search analytics does not contain the raw query.
- [ ] Run both tests and verify RED.
- [ ] Implement diagnostics sanitizer and replace raw `result.error`/persistence error usage metadata.
- [ ] Replace analytics `query` with non-PII summary properties.
- [ ] Run targeted tests and verify GREEN.### Task 4: Correct saved-analysis count and add history

**Files:**
- Create: `src/app/history/page.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/components/app-shell/nav.tsx`
- Test: `tests/analysis/history-page.test.ts`

**Interfaces:**
- Dashboard obtains an exact count independently from the latest-eight preview query.
- `/history` paginates the authenticated user's own analyses newest-first and links to `/analysis/[id]`.

- [ ] Add a failing test proving a 30-analysis user sees total `30` while the dashboard preview still renders only eight rows.
- [ ] Add a failing history-page test for authenticated user isolation and newest-first results.
- [ ] Implement exact count query and the minimal authenticated history page.
- [ ] Add History navigation for signed-in users.
- [ ] Run targeted tests and verify GREEN.

### Task 5: Ambassador workspace entitlements

**Files:**
- Create: `supabase/migrations/20260828xxxxxx_affiliate_ambassador_workspace_entitlements.sql`
- Modify: `src/lib/db/repositories.ts`
- Test: `tests/db/workspace-entitlements.test.ts`
- Test: `tests/db/affiliate-ambassador.test.ts`

**Interfaces:**
- `affiliate_ambassador` receives an explicit workspace entitlement set rather than inheriting Free.
- Target launch values: 100 monthly analyses, 30 deep, 50 batch rows, 75 watchlist items, 5 portfolios; no paid billing requirement.

- [ ] Add failing SQL/contract tests for ambassador batch/watchlist/portfolio access.
- [ ] Implement ambassador branch in `private.workspace_entitlements` and `getBatchEntitlement`.
- [ ] Run DB/repository tests and verify GREEN.### Task 6: Release verification checkpoint

**Files:**
- Update after implementation: `docs/LAUNCH_CHECKLIST.md`

**Interfaces:**
- Produces a verified branch state ready for production smoke and domain cutover; no deployment occurs before this gate.

- [ ] Run targeted suites for company search, report/export, analysis API, search API, history/dashboard, workspace entitlements.
- [ ] Run `npm test` and require all test files/tests green.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Run `npm audit` and `npm audit --omit=dev`; require zero known vulnerabilities.
- [ ] Review `git status --short` and confirm no unrelated file was reset, removed, or overwritten.
- [ ] Update launch checklist with evidence and remaining manual blockers only.

## Self-review

- Spec coverage: resolver ambiguity, report currency, diagnostics privacy, analysis retrieval, ambassador access and full gate are all mapped to tasks.
- No threshold/rating calibration is introduced.
- No provider gap is papered over with fabricated FX or specialized metrics.
- Full affiliate commission dashboard, persistent batch jobs, PDF generation and advanced portfolio analytics stay outside this first release-critical implementation slice and follow after this gate.
