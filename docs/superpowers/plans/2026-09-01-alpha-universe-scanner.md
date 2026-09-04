# Alpha Universe Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend StockBox Alpha from rankings over saved user analyses to a server-owned point-in-time security universe that can safely scan eligible securities without consuming user quotas or polluting user analysis history.

**Architecture:** Add an independent universe registry and scan-run ledger in Supabase. Ingest current US listed equities from Nasdaq Trader's official symbol-directory files through a deterministic parser, enrich identities from the SEC current ticker/exchange mapping, and execute bounded server-side scan batches through the existing `analyzeCompany` pipeline. Scanner-created Alpha predictions reference universe securities directly and remain separate from user analyses.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/Postgres, Vitest, existing StockBox provider pipeline, GitHub Actions scheduling with CRON_SECRET-protected application endpoints.

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

- [x] Test Nasdaq-listed and other-exchange-listed parsing.
- [x] Exclude ETF/test/warrant/right/unit/preferred/debt-like securities.
- [x] Preserve source creation timestamp without inventing a timezone.
- [x] Add SEC ticker/CIK identity enrichment with fail-closed validation.

### Task 2: Universe and scan-run persistence

- [x] Add server-owned universe/security tables with RLS locked to service role.
- [x] Make scanner predictions independent of user analysis rows.
- [x] Add scan-run audit ledger and point-in-time memberships.
- [x] Add persistent retry/queue state so failed symbols cannot block the market scan.

### Task 3: Universe ingestion repository

- [x] Fetch official Nasdaq Trader symbol directories.
- [x] Enrich US identity from SEC ticker/exchange directory when configured.
- [x] Preserve historical identity and deactivate missing current listings instead of deleting them.
- [x] Provide a resumable stale-first scanner queue from persistent scan state.

### Task 4: Bounded Alpha universe scanner

- [x] Test stale-first selection and hard batch bounds.
- [x] Test retry cooldown for repeatedly failing symbols.
- [x] Run the existing StockBox `analyzeCompany()` pipeline without customer quota reservation.
- [x] Persist universe-backed point-in-time Alpha predictions and scan audit state.
- [x] Keep provider work sequential and bounded instead of uncontrolled fan-out.

### Task 5: Protected operational endpoints

- [x] Add separate universe refresh, scanner and matured-outcome endpoints.
- [x] Authenticate scheduled GET calls using bearer `CRON_SECRET`.
- [x] Allow controlled manual POST through StockBox admin authentication.

### Task 6: Automated matured outcome collection

- [x] Select only predictions whose 30/90/180/365-day observation window is currently mature.
- [x] Fetch real configured market data instead of reconstructing historical entry prices.
- [x] Record outcomes through the existing hindsight-safe evaluator.
- [x] Leave benchmark return optional rather than inventing a benchmark observation.

### Task 7: Scheduling and Hidden Gems transparency

- [x] Schedule daily official-universe refresh without consuming extra Vercel cron slots.
- [x] Schedule bounded scan batches four times per hour.
- [x] Schedule daily matured-outcome collection.
- [x] Render scanner-backed rankings without fake analysis links.
- [x] State explicitly that automated scanner coverage is US-listed equity coverage, not Nordic/global full-market coverage.

### Task 8: Verification and release gate

- [ ] Latest-head lint passes.
- [ ] Latest-head typecheck passes.
- [ ] Latest-head full unit suite passes.
- [ ] Latest-head production build passes.
- [ ] PR diff reviewed for data integrity, auth boundaries and fundamental-score non-regression.
