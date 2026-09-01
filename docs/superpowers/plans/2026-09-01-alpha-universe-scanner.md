# Alpha Universe Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend StockBox Alpha from rankings over saved user analyses to a server-owned point-in-time security universe that can safely scan eligible securities without consuming user quotas or polluting user analysis history.

**Architecture:** Add an independent universe registry and scan-run ledger in Supabase. Ingest current US listed equities from Nasdaq Trader's official symbol-directory files through a deterministic parser, allow future universe sources to plug into the same normalized interface, and execute bounded server-side scan batches through the existing company-resolution/analyzeCompany pipeline. Scanner-created Alpha predictions reference universe securities directly and remain separate from user analyses.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/Postgres, Vitest, existing StockBox provider pipeline, Vercel-compatible cron route.

**Spec:** `docs/ALPHA_BREAKOUT_INTELLIGENCE.md`

## Global Constraints

- Do not modify the existing StockBox fundamental score path.
- Do not consume customer analysis entitlements for scanner work.
- Do not fabricate missing securities, fundamentals, estimates, sentiment, or outcomes.
- Keep all universe snapshots and predictions point-in-time and model/source-versioned.
- Scanner batches must be bounded and resumable to respect provider rate limits and deployment execution limits.
- Current automated universe source may only claim the markets covered by its source.

---

### Task 1: Deterministic official US universe parser

**Files:**
- Create: `src/lib/alpha/universe.ts`
- Create: `tests/analysis/alpha-universe.test.ts`

**Interfaces:**
- Produces `parseNasdaqTraderDirectory(text, source)` and normalized `AlphaUniverseSecurity` records.

- [ ] Write tests for Nasdaq-listed and other-exchange-listed input, ETF/test/security-type exclusions, source timestamps and deterministic identity keys.
- [ ] Verify the tests fail before implementation.
- [ ] Implement parser and eligibility policy.
- [ ] Verify parser tests pass.

### Task 2: Universe and scan-run persistence

**Files:**
- Create: `supabase/migrations/20260901234500_alpha_universe_scanner.sql`

**Interfaces:**
- Produces `alpha_universe_securities`, `alpha_universe_memberships`, `alpha_scan_runs` and universe-backed `alpha_predictions`.

- [ ] Add server-owned universe/security tables with RLS locked to service role.
- [ ] Make `alpha_predictions.analysis_id` nullable and add `universe_security_id`.
- [ ] Require each prediction to originate from either a user analysis or universe security.
- [ ] Add uniqueness/indexes for point-in-time scanner snapshots.

### Task 3: Universe ingestion repository

**Files:**
- Create: `src/lib/alpha/universe-repository.ts`

**Interfaces:**
- Produces `refreshOfficialUsUniverse()` and read APIs for active eligible scanner candidates.

- [ ] Fetch official Nasdaq Trader `nasdaqlisted.txt` and `otherlisted.txt` over HTTPS.
- [ ] Parse and upsert normalized securities/memberships with exact source-as-of values.
- [ ] Mark memberships absent from a later source snapshot inactive without deleting historical identity.
- [ ] Return counts/failures without inventing successful coverage.

### Task 4: Bounded Alpha universe scanner

**Files:**
- Create: `src/lib/alpha/scanner.ts`
- Create: `tests/analysis/alpha-scanner.test.ts`

**Interfaces:**
- Produces deterministic candidate selection/batching and server `runAlphaUniverseScan()`.

- [ ] Write tests for stale-first selection, retry cooldown, max batch bounds and no duplicate model/as-of work.
- [ ] Implement pure scan scheduling helpers.
- [ ] Resolve each security through existing StockBox company search/identity code.
- [ ] Run existing `analyzeCompany()` with research/balanced mode without user quota reservation.
- [ ] Map report to Alpha and persist universe-backed prediction snapshots.
- [ ] Persist per-security scan status and run totals.

### Task 5: Protected cron endpoints

**Files:**
- Create: `src/app/api/alpha/universe/route.ts`
- Create: `src/app/api/alpha/scan/route.ts`

**Interfaces:**
- Produces CRON_SECRET-protected POST/GET-compatible endpoints for universe refresh and bounded scan execution.

- [ ] Authenticate with bearer `CRON_SECRET` and fail closed when missing.
- [ ] Keep refresh and scan endpoints separate so ingestion failures cannot force expensive analysis work.
- [ ] Return machine-readable counts and error classes without leaking secrets/provider internals.

### Task 6: Hidden Gems coverage transparency

**Files:**
- Modify: `src/lib/alpha/repository.ts`
- Modify: `src/app/hidden-gems/page.tsx`

**Interfaces:**
- Hidden Gems reports saved-analysis vs scanner universe coverage independently.

- [ ] Include universe source/active-security/scanned-security counts.
- [ ] Label US official-directory coverage precisely.
- [ ] Keep Nordic/global coverage as unavailable until a licensed/reliable universe source is configured.

### Task 7: Verification and documentation

**Files:**
- Modify: `docs/ALPHA_BREAKOUT_INTELLIGENCE.md`

- [ ] Run lint, typecheck, all unit tests and production build in CI.
- [ ] Confirm existing fundamental analysis tests remain green.
- [ ] Document source coverage, operational limits and explicit non-claims.
