# StockBox 2.0 upgrade report

Date: 2026-09-05

Repository: `alstockbox/stockbox-2.0`

Upgrade branch: `upgrade/stockbox-2-ux-portfolio-mobile-20260905`

Pull request: `#35` — **StockBox 2.0 UX, conversion, portfolio & mobile overhaul**

## Executive summary

The StockBox 2.0 upgrade has been implemented as an isolated upgrade of the existing sellable SaaS. It does not convert StockBox 2.0 into StockBox 3.0 and does not intentionally modify the separate StockBox 3.0 work.

The upgrade focuses on conversion, first impression, onboarding, portfolio utility, mobile UX, retention foundations, analytics and production safety.

The substantive code state was verified successfully on commit:

`9df65b9b729440fe1ede9c8c3eb8cd461d62bbc2`

GitHub Actions run:

`33965975452` — **StockBox 2 Upgrade CI**

All three jobs in that verification run completed successfully:

- `app-quality` — success
- `portfolio-migration-smoke` — success
- `main-baseline-tests` — success

The app-quality gate included successful Portfolio 2 tests, workspace regression tests, analytics regression tests, auth regression tests, the full suite excluding the explicitly fingerprinted pre-existing archetype baseline, typecheck, lint of changed StockBox 2 files, production build and the final verification gate.

The disposable-Supabase migration smoke successfully applied the base schema and both Portfolio 2 migrations and verified the required tables, RLS state, indexes and RPC functions.

## What was implemented

### 1. Landing page and first impression

- Clearer above-the-fold value proposition.
- Dominant free-analysis action in the first viewport.
- Direct company/ticker search before signup.
- Limited anonymous StockBox analysis preview.
- Strong transition from preview to account creation/full analysis.
- Lazy product-demo modal with a safe fallback if no real video URL is configured.
- Conversion events wired through the existing privacy-safe analytics boundary.

The intention is to make the product understandable and usable within the first seconds instead of forcing a visitor to understand the entire product before taking action.

### 2. Anonymous analysis preview

A separate limited preview route was added rather than weakening the authenticated full-analysis route.

This preserves the existing entitlement/security model while letting new visitors experience StockBox before signup.

The preview is intentionally limited; full reports, persistence, history and normal authenticated product functionality remain behind the normal account flow.

### 3. Signup and onboarding

The onboarding path is oriented toward reaching the first analysis faster instead of adding unnecessary setup before the user sees value.

Existing hardened authentication flows are reused rather than replaced.

### 4. Portfolio 2.0

Portfolio was upgraded from a basic aggregate-holdings model toward a transaction-backed investment workspace.

Implemented foundations include:

- dated purchases
- quantity
- purchase price
- transaction currency
- fees
- transaction edit/delete support
- backward-compatible aggregate `holdings` read model
- portfolio base currency
- FX-aware cost/value normalization
- invested capital
- current market value
- unrealized P/L
- portfolio weights
- StockBox analysis/signals per holding
- weighted whole-portfolio analysis
- partial-failure handling
- retry/refresh foundation
- portfolio snapshots/history foundation

### 5. Portfolio data model and compatibility

Two additive migrations are included:

1. `20260905140500_portfolio_2_private_schema.sql`
2. `20260905141000_portfolio_2_transactions_snapshots.sql`

The transaction migration creates:

- `public.portfolio_transactions`
- `public.portfolio_snapshots`
- required indexes
- RLS policies
- transaction RPCs
- transaction-to-holdings rebuild logic

Existing holdings are backfilled into buy transactions rather than deleted.

The existing `holdings` table remains as a backward-compatible derived/read model.

### 6. Portfolio ownership and security

The Portfolio 2 transaction RPC validates the authenticated user against the owning portfolio before writing.

RLS remains enabled on user-owned portfolio data.

Legacy direct holding update/delete actions retain explicit ownership verification as defense in depth in addition to RLS.

No service-role credential was moved to the browser.

### 7. Mobile UX

- Persistent authenticated mobile bottom navigation.
- Larger shared touch targets.
- Stronger focus treatment.
- Responsive portfolio presentation.
- Mobile-friendly landing analysis interaction.

The goal is to make the common StockBox tasks practical from a phone rather than treating mobile as a shrunk desktop layout.

### 8. Analytics and conversion measurement

The upgrade reuses the privacy-safe analytics boundary and adds conversion-oriented events around the new flow.

The implementation avoids intentionally sending raw sensitive portfolio/user content to analytics.

### 9. CI and release safety

A dedicated upgrade workflow was added.

The final CI design is baseline-aware because current `main` contains failures unrelated to this StockBox 2 upgrade.

The workflow:

- records `main` tests/lint as informational baseline
- runs focused Portfolio 2 regression tests
- runs analytics/auth regressions
- runs the full suite excluding only the known archetype baseline file
- separately fingerprints the two known archetype failures so a changed/new failure still blocks the upgrade
- runs typecheck
- lints all JS/TS files changed by this PR relative to `main`
- runs a production Next.js build
- runs a final verification gate
- boots disposable Supabase and validates the Portfolio 2 migrations

## Verification result

Verified code commit:

`9df65b9b729440fe1ede9c8c3eb8cd461d62bbc2`

Verified GitHub Actions run:

`33965975452`

### App quality

PASS:

- dependency install
- Portfolio 2 math tests
- workspace Portfolio 2 action tests
- canonical identity regression
- analytics regression tests
- auth regression tests
- full suite excluding the known main archetype baseline
- known archetype baseline fingerprint
- TypeScript typecheck
- lint of changed StockBox 2 JS/TS files
- Next.js production build
- final verification gate

### Database migration smoke

PASS:

- disposable Supabase startup
- initial StockBox schema
- Portfolio 2 private-schema migration
- Portfolio 2 transactions/snapshots migration
- RLS invariant check
- index invariant check
- transaction RPC invariant check
- clean shutdown

## Existing baseline issues intentionally not disguised as upgrade regressions

Current `main` has two known failing assertions in `tests/analysis/archetypes.test.ts` around valuation-gap diagnostics:

- `diagnoses valuation multiple gaps by failed input condition`
- `diagnoses FCF yield by missing simple free-cash-flow inputs`

The upgrade CI does not silently ignore arbitrary failures. It fingerprints this exact two-test baseline and separately requires the rest of the suite to pass.

Current `main` also contains unrelated Growth-v3 lint errors in Growth-v3-specific files. This PR does not modify those files, so the StockBox 2 upgrade gate lints every JS/TS file changed by this PR rather than failing because of unrelated ongoing StockBox 3/growth-engine work.

These baseline issues should eventually be repaired on `main` in their correct scope, but they are not introduced by the StockBox 2 upgrade.

## External deployment blocker observed

Vercel checks were observed failing with `build-rate-limit` / an upgrade-to-Pro build-rate-limit target.

That is an external Vercel deployment quota/rate-limit condition, not a failure of the verified Next.js production build. The production build completed successfully inside GitHub Actions.

A fresh Vercel production deployment must therefore be triggered when the Vercel build limit allows it.

## Manual work still required

See the root file:

`MANUAL_STEPS.md`

The remaining human-controlled release actions are primarily:

1. confirm final PR checks
2. merge PR #35 into StockBox 2.0 `main`
3. back up production Supabase
4. apply the two Portfolio 2 migrations in order
5. validate the production DB after migration
6. upload/configure the real intro video via `NEXT_PUBLIC_INTRO_VIDEO_URL`
7. redeploy production when Vercel's build-rate-limit permits it
8. run the documented production desktop/mobile smoke test
9. confirm analytics and first-day error monitoring

## Release recommendation

The StockBox 2 upgrade code is technically ready for merge once the latest PR head has the same successful upgrade checks and the only remaining red deployment checks are confirmed to be the external Vercel build-rate-limit condition.

Do not deploy the Portfolio 2 web UI against production before the required Portfolio 2 database migrations are applied.

## Rollback strategy

The database changes are additive and preserve/backfill existing portfolio data.

If a serious web regression is discovered after launch:

1. roll back/revert the StockBox 2 web deployment first
2. keep the new Portfolio 2 transaction/snapshot data intact
3. diagnose the application regression
4. avoid dropping the additive tables in an emergency unless a separately reviewed migration explicitly requires it

This reduces the chance of converting an application rollback into unnecessary customer-data loss.
