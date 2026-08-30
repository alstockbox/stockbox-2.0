# Commercial Plans & Ambassador Giveaways Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the approved five-tier StockBox pricing ladder and add secure admin-created ambassador giveaway access.

**Architecture:** Keep current plan keys and Stripe Checkout/Portal lifecycle. Add promotional access as a separate database layer resolved against paid access by plan rank, so giveaways never mutate Stripe subscriptions. Quota enforcement remains database-authoritative and adds the Free rolling 30-day introductory allowance.

**Tech Stack:** Next.js 16, TypeScript, Stripe Billing/Checkout/Portal, Supabase Postgres/RPC/RLS, Vitest, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-30-commercial-plans-giveaways-design.md`

## Global Constraints
- Customer-facing `premium` name is `Pro`; internal key remains `premium`.
- Prices: Basic 49→69, Standard 79→119, Pro 159→179 for first 3 months; Elite 399 always.
- Analysis quotas: Free 5 first 30 days then 3/month; Basic 10; Standard 35; Pro 90; Elite 350.
- Giveaway access never creates Stripe invoices or affiliate commission.
- Higher of active paid plan and active promotional grant wins.
- Only admin can mint/revoke giveaway campaigns; ambassadors are read-only.
- No real charge, transfer, payout, or connected-account mutation during QA.

---

### Task 1: Generalize plan catalog and billing state
**Files:** `src/lib/billing/plans.ts`, `src/lib/billing/subscriptions.ts`, `src/lib/billing/pricing-state.ts`, `src/lib/billing/readiness.ts`, `src/lib/env/server.ts`, `src/app/pricing/page.tsx`, `src/app/api/stripe/checkout/route.ts`.
**Tests:** `tests/billing/plans.test.ts`, `tests/billing/subscriptions.test.ts`, `tests/billing/pricing-state.test.ts`, `tests/billing/checkout-flow.test.ts`, `tests/billing/readiness.test.ts`.- [ ] Write failing tests for all five active plans, approved prices/quotas, Pro display name, launch metadata, generic subscription parsing, and plan-specific checkout.
- [ ] Run focused billing tests and verify they fail for the old Basic-only behavior.
- [ ] Update plan catalog, coupon env union, env schema, billing readiness, subscription state, and pricing actions.
- [ ] Make checkout use the selected plan, generic launch-offer metadata, and send existing paid users to Portal rather than creating duplicate subscriptions.
- [ ] Update pricing layout/copy to render all tiers and highlight Standard.
- [ ] Run focused billing tests until green.

### Task 2: Database plan catalog, Free intro quota, and effective access
**Files:** create one dated migration under `supabase/migrations/`; update DB regression tests.
**Interfaces:** Migration updates `public.plans`; replaces `public.reserve_analysis_entitlement(uuid,text)` and `private.workspace_entitlements(uuid)` while preserving signatures.
- [ ] Write failing migration tests asserting new plan values and rolling Free first-30-day logic.
- [ ] Add plan-rank resolution helper in SQL or equivalent deterministic CASE ordering: free < basic < standard < premium < elite.
- [ ] Set Free database entitlement to 3 recurring analyses and override to 5 only inside first 30 days.
- [ ] Ensure introductory quota counts from profile creation rather than calendar-month reset.
- [ ] Resolve normal paid access through the updated active plan rows.
- [ ] Run DB-focused tests green.

### Task 3: Giveaway persistence and atomic redemption
**Files:** same migration; new tests `tests/db/giveaway-grants.test.ts`.
**Interfaces:** tables `affiliate_giveaway_campaigns`, `affiliate_giveaway_codes`, `promotional_access_grants`; RPCs for admin creation/revocation and authenticated redemption.
- [ ] Write failing tests for RLS, role checks, single-use codes, expiry, grant duration, and no Stripe/commission coupling.
- [ ] Create tables with UUID FKs, timestamps, status checks, unique codes, and indexes for active-grant resolution.
- [ ] Add security-definer admin campaign creation RPC accepting pre-generated unique codes and validating active ambassador + paid plan + bounded quantity/duration.
- [ ] Add admin revoke RPC that disables unused codes without deleting audit history.
- [ ] Add redemption RPC that locks the code, rejects reused/expired/revoked codes, records redeemer, and inserts a time-bounded grant atomically.
- [ ] Update effective-plan SQL so active promotional access can raise—but never lower—the underlying paid plan.
- [ ] Run giveaway DB tests green.
### Task 4: Admin giveaway controls
**Files:** `src/app/admin/actions.ts`, `src/app/admin/page.tsx`; tests under `tests/affiliate/` and `tests/db/`.
- [ ] Write failing tests for admin-only campaign creation, validation bounds, ambassador assignment, and revocation wiring.
- [ ] Add server actions that generate cryptographically random codes, call the admin RPC, revalidate Admin/Affiliate views, and never expose service credentials.
- [ ] Add Admin UI to select ambassador, plan, quantity, duration, claim expiry and campaign label.
- [ ] Show campaign counts/status and allow revoking active campaigns.
- [ ] Run admin-focused tests green.

### Task 5: Ambassador visibility and winner redemption
**Files:** `src/lib/affiliate/service.ts`, `src/app/affiliate/page.tsx`, `src/app/settings/page.tsx`, create `src/app/settings/giveaway-actions.ts`; focused tests.
- [ ] Write failing tests that ambassadors only receive their campaign/code data and cannot mutate it.
- [ ] Extend affiliate service/dashboard with campaign plan, duration, claim expiry, and code status.
- [ ] Add read-only campaign cards/copyable codes to Affiliate dashboard.
- [ ] Add authenticated giveaway-code redemption form in Settings with explicit success/error state.
- [ ] Ensure successful redemption does not alter the `subscriptions` row and does not create affiliate commission data.
- [ ] Run focused UI/service tests green.

### Task 6: Stripe catalog and production environment
**External systems:** Stripe live account and Vercel Production env.
- [ ] Read existing Stripe products/prices/coupons and reuse products where safe; never delete historical objects.
- [ ] Create new canonical inclusive-tax monthly prices: Basic 69, Standard 119, Pro 179, Elite 399 SEK.
- [ ] Create 3-month repeating amount-off coupons: Basic 20 SEK, Standard 40 SEK, Pro 20 SEK; Elite has none.
- [ ] Update product metadata/marketing quota values to 10/35/90/350 analyses respectively.
- [ ] Set exact Vercel Production env IDs for all four prices and three launch coupons.
- [ ] Read back Stripe/Vercel state and verify identifiers map to the intended plan/amount; do not create a Checkout charge.

### Task 7: Full release gate and deployment
- [ ] Apply the tested Supabase migration and verify its migration version, tables, RPC signatures, plan rows, and security posture.
- [ ] Run full Vitest suite, typecheck, ESLint, Webpack production build, `git diff --check`, staged secret scan, and production dependency audit.
- [ ] Commit only intended files, fetch/race-check `origin/main`, then fast-forward push the verified commit.
- [ ] Verify exact commit is Vercel Production READY and its Turbopack build generated all routes.
- [ ] Smoke `/`, `/pricing`, auth redirects, provider health, payout cron protection, and giveaway unauthenticated boundaries.
- [ ] Report only remaining manual owner checks; do not claim real billing/giveaway redemption E2E without evidence.
