# Ambassador Custom Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each Affiliate Ambassador independently configurable from `/admin`, while preserving admin unlimited access and existing paid/free customer behavior.

**Architecture:** Add one service-role-only `ambassador_entitlements` row per Ambassador-capable user. Analysis, Deep/Research, Batch, Watchlist and Portfolio resolution all read this single row; affiliate commission remains canonical on `affiliates.commission_basis_points`. Admin mutations update role, limits, affiliate status/code, commission and audit log atomically through one RPC.

**Tech Stack:** Next.js 16, TypeScript, Supabase/Postgres PL/pgSQL, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-28-ambassador-custom-entitlements-design.md`

## Global Constraints

- Admin remains unlimited for all analysis depths and is never subject to Ambassador quota.
- Ambassador total/deep limits are integers in `0..100000`; Deep/Research cannot exceed total.
- Batch rows are `0..50`; watchlist items `0..100000`; portfolios `0..10000`.
- Commission remains stored only as `affiliates.commission_basis_points`, constrained to `0..10000`.
- Removing Ambassador status preserves entitlement and affiliate history but disables referral status.
- No anon/authenticated direct access to Ambassador entitlement mutation RPCs or table writes.
- Test account after rollout: `arthurfl.contact@gmail.com` => `150 / 150 / 50 / 75 / 5`, commission `0 bp`.

---
### Task 1: Database source of truth

**Files:**
- Create: `supabase/migrations/20260828190000_ambassador_custom_entitlements.sql`
- Test: `tests/db/affiliate-ambassador.test.ts`
- Test: `tests/db/affiliate-attribution.test.ts`

**Interfaces:**
- Produces table `public.ambassador_entitlements(user_id, monthly_analyses, deep_analyses, batch_rows, watchlist_items, portfolios, created_at, updated_at)`.
- Produces RPC `public.set_affiliate_ambassador_access(uuid, uuid, boolean, integer, integer, integer, integer, integer, integer)` returning JSONB.

- [ ] **Step 1: Write RED migration-contract tests**

Add assertions that SQL contains the entitlement table, all CHECK constraints, RLS/revokes, backfill `100/100/50/75/5`, and a service-role-only atomic RPC that updates profile role, affiliate status/commission and audit log.

- [ ] **Step 2: Run RED tests**

Run: `npm test -- tests/db/affiliate-ambassador.test.ts tests/db/affiliate-attribution.test.ts`
Expected: FAIL because the table/new RPC do not exist.

- [ ] **Step 3: Implement migration**

Use defaults only for backfill/fail-safe: `100,100,50,75,5`. Preserve existing affiliate code/user ownership; disabling sets affiliate `status='inactive'` and does not delete rows.

- [ ] **Step 4: Run GREEN tests**

Run the same command; expected PASS.

- [ ] **Step 5: Commit**

Commit only migration + DB tests with message `ambassador-entitlements-database`.

### Task 2: Resolve every quota from the same record

**Files:**
- Modify: `supabase/migrations/20260828190000_ambassador_custom_entitlements.sql`
- Modify: `src/lib/db/repositories.ts`
- Test: `tests/db/affiliate-ambassador.test.ts`
- Test: `tests/batch/resolve-route.test.ts`

**Interfaces:**
- `reserve_analysis_entitlement()` reads custom `monthly_analyses` and `deep_analyses`.
- `private.workspace_entitlements()` reads custom batch/watchlist/portfolio values.
- `getBatchEntitlement()` reads configured Ambassador `batch_rows`, not hard-coded 50.
- [ ] **Step 1: Write RED resolver tests**

Prove two ambassadors with 20 and 150 monthly limits return different `limits.analyses`; prove Deep/Research uses its own configured limit; prove batch can be 0, 20 or 50.

- [ ] **Step 2: Run RED tests**

Run: `npm test -- tests/db/affiliate-ambassador.test.ts tests/batch/resolve-route.test.ts`
Expected: FAIL on hard-coded Ambassador values.

- [ ] **Step 3: Implement resolver changes**

For missing entitlement rows, use historical fallback `100/100/50/75/5` and record an admin-visible diagnostic without treating the user as Free.

- [ ] **Step 4: Run GREEN tests**

Run the same test command; expected PASS.

- [ ] **Step 5: Commit**

Commit migration/repository/tests with message `use-custom-ambassador-quotas`.

### Task 3: Admin mutation action

**Files:**
- Modify: `src/app/admin/actions.ts`
- Test: `tests/auth/affiliate-admin-actions.test.ts`

**Interfaces:**
- `setAffiliateAmbassadorAccessAction(formData: FormData)` validates and calls `set_affiliate_ambassador_access`.
- Accept fields: `userId`, `enabled`, `monthlyAnalyses`, `deepAnalyses`, `batchRows`, `watchlistItems`, `portfolios`, `commissionPercent`.

- [ ] **Step 1: Write RED action tests**

Test 150/150/50/75/5 and 0% mapping; reject negative values, Deep > total, batch > 50, commission > 100%, own admin/protected admin targets.

- [ ] **Step 2: Run RED test**

Run: `npm test -- tests/auth/affiliate-admin-actions.test.ts`
Expected: FAIL because the new action/schema/RPC arguments do not exist.

- [ ] **Step 3: Implement minimal action**

Convert `commissionPercent` to integer basis points using exact decimal parsing; `12.5` => `1250`, `0` => `0`, `100` => `10000`. Never trust browser min/max attributes.

- [ ] **Step 4: Run GREEN test**

Run same command; expected PASS.

- [ ] **Step 5: Commit**

Commit action + tests with message `admin-configurable-ambassador-access`.
### Task 4: Admin management UI

**Files:**
- Modify: `src/app/admin/page.tsx`
- Test: `tests/admin/admin-page.test.ts` or extend the nearest existing admin source test.

**Interfaces:**
- Admin page loads profiles plus matching `ambassador_entitlements` and `affiliates` rows server-side.
- Each row submits to `setAffiliateAmbassadorAccessAction`.

- [ ] **Step 1: Write RED UI contract test**

Assert the page exposes inputs for monthly/deep/batch/watchlist/portfolios/commission, referral code/status, and enable/disable controls; protected admins remain disabled.

- [ ] **Step 2: Run RED test**

Run the focused admin UI test; expected FAIL because current UI only toggles a fixed 100-analysis role.

- [ ] **Step 3: Implement UI**

Render existing values for ambassadors; non-ambassadors default to `100/100/50/75/5` and `0%` when first enabled. Display commission percent from basis points and never expose service-role credentials.

- [ ] **Step 4: Run GREEN test**

Run focused admin UI/action tests; expected PASS.

- [ ] **Step 5: Commit**

Commit UI + tests with message `ambassador-admin-controls`.

### Task 5: Full regression and production rollout

**Files:**
- No new product files unless a regression requires a narrowly-scoped fix.
- Production data change only after migration + deployment verification.

- [ ] **Step 1: Run targeted regression**

Run DB Ambassador tests, affiliate tests, admin action/UI tests, batch route tests, analysis entitlement tests, workspace tests and admin-unlimited tests.

- [ ] **Step 2: Run full release gate**

Run: `npm test && npm run typecheck && npm run lint && npm run build && git diff --check && npm audit && npm audit --omit=dev`
Expected: all exit 0; no vulnerabilities.

- [ ] **Step 3: Race-check main**

Fetch `origin/main`; merge/rebase only if remote advanced. Never force-push or discard parallel changes.

- [ ] **Step 4: Apply production migration before code rollout**

Use Supabase migration tooling. Verify RLS enabled, anon/authenticated have no direct table/RPC mutation rights, and legacy Ambassador rows are backfilled.

- [ ] **Step 5: Deploy exact verified SHA**

Push/fast-forward `main`, wait for Vercel `READY`, then smoke `/admin`, `/affiliate`, `/api/analysis`, `/api/batch/resolve` and runtime logs.
- [ ] **Step 6: Configure production test account**

Find `arthurfl.contact@gmail.com` by email, then call the admin/service-role mutation for that existing profile with `enabled=true`, `150,150,50,75,5,0bp`. Do not hardcode the UUID in any migration or source file.

- [ ] **Step 7: Verify live behavior**

Confirm profile role is `affiliate_ambassador`; entitlement row is exactly `150/150/50/75/5`; affiliate is active with stable referral code and `0 bp`; analysis entitlement reports 150 total/150 deep; batch reports 50. Confirm admin remains unlimited.

- [ ] **Step 8: Verify editability**

From `/admin`, temporarily change test account monthly/deep limits to `20/20`, verify backend returns 20, then restore `150/150`. This proves the UI is the real source of truth rather than display-only state.

- [ ] **Step 9: Final production smoke**

Check Vercel warning/error/fatal logs, Supabase advisor regression, referral route, affiliate dashboard, and no unexpected role changes on other profiles.

- [ ] **Step 10: Commit rollout documentation if needed**

Update release status only with facts proven by the production smoke; do not mark legal or plan-limited leaked-password protection as technically fixed.
