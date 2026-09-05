# StockBox 2.0 — manual release steps

This file contains only the actions that cannot safely be completed automatically from the upgrade branch.

## 1. Confirm the PR checks before merge

PR: `#35` — `StockBox 2.0 UX, conversion, portfolio & mobile overhaul`

Required upgrade checks:

- `StockBox 2 Upgrade CI / app-quality`
- `StockBox 2 Upgrade CI / portfolio-migration-smoke`
- `StockBox 2 Upgrade CI / main-baseline-tests`

The `main-baseline-tests` job is informational for pre-existing `main` failures. The upgrade gate separately verifies that the known archetype baseline is unchanged and blocks new StockBox 2 regressions.

If Vercel checks show `build-rate-limit`, that is a Vercel deployment quota/rate-limit failure rather than a source-code build failure. Re-run/redeploy when the Vercel build quota allows it.

Do not merge if the StockBox 2 upgrade CI itself is red.

## 2. Merge PR #35 into `main`

Merge only after the upgrade CI is green.

The PR is intentionally isolated to StockBox 2.0. Do not copy these commits into the separate StockBox 3.0 repository/branch.

## 3. Apply the two Portfolio 2 migrations to production Supabase

Take a production database backup/snapshot first.

Apply these migrations in this exact order:

1. `supabase/migrations/20260905140500_portfolio_2_private_schema.sql`
2. `supabase/migrations/20260905141000_portfolio_2_transactions_snapshots.sql`

The second migration:

- creates `portfolio_transactions`
- creates `portfolio_snapshots`
- enables RLS and ownership policies
- backfills existing aggregate holdings into dated buy transactions
- adds transaction create/update/delete RPCs
- keeps the existing `holdings` table as the backward-compatible read model

Do not delete the existing `holdings` table after migration.

### Production database checks

After migration, verify in Supabase SQL Editor:

```sql
select to_regclass('public.portfolio_transactions');
select to_regclass('public.portfolio_snapshots');
select to_regprocedure('public.record_portfolio_transaction(uuid,text,text,numeric,numeric,text,date,numeric,numeric,text,text)');
select to_regprocedure('public.update_portfolio_transaction(uuid,numeric,numeric,text,date,numeric)');
select to_regprocedure('public.delete_portfolio_transaction(uuid)');
```

All five queries must return a non-null value.

Also verify that existing customer portfolio rows still exist before allowing production traffic.

## 4. Add the real StockBox intro/demo video

Upload the final StockBox product video to a stable HTTPS URL that Vercel users can access.

In the production Vercel project add/update:

```text
NEXT_PUBLIC_INTRO_VIDEO_URL=https://your-real-video-url
```

Then redeploy.

If this variable is left blank, the landing page remains functional and shows the configured fallback instead of a broken video player.

## 5. Redeploy production from the merged `main`

When Vercel is no longer blocked by `build-rate-limit`:

1. Trigger a fresh production deployment from `main`.
2. Confirm `www.getstockbox.app` / the production StockBox domain points to the new deployment.
3. Confirm the deployment uses the normal production Supabase and Stripe environment variables.
4. Do not create or change any StockBox 3.0 deployment while doing this.

## 6. Run the production smoke test

Use both desktop and a real mobile viewport/device.

### Landing and conversion

- Open the landing page while logged out.
- Confirm the value proposition is clear immediately.
- Search for a real company in the free-analysis box.
- Select the correct canonical ticker.
- Run the limited anonymous analysis preview.
- Confirm the signup CTA appears after the preview.
- Open and close the product-demo modal.

### Signup and onboarding

- Create a new test account.
- Confirm signup/onboarding routes toward the first analysis without unnecessary steps.
- Run one authenticated analysis.

### Portfolio 2.0

- Create a portfolio with the intended base currency.
- Add a purchase with ticker, quantity, purchase price, currency, purchase date and optional fees.
- Confirm the holding is rebuilt from the transaction.
- Add a second purchase of the same security and verify weighted cost basis.
- Edit a transaction and confirm totals change correctly.
- Delete a transaction and confirm totals change correctly.
- Verify current value, invested capital, P/L and weights.
- Run the StockBox portfolio analysis.
- Confirm individual holding failures do not destroy the whole portfolio result.
- Confirm retry/refresh behaves normally.

### Mobile

- Confirm the persistent mobile bottom navigation is usable.
- Confirm buttons/touch targets are easy to hit.
- Confirm portfolio cards do not overflow horizontally.
- Confirm the landing search/results/CTA are usable without zooming.

## 7. Confirm analytics after launch

No new analytics secret is required by this upgrade, but the existing analytics provider must be configured if you want production funnel data.

Verify events arrive for at least:

- free-analysis CTA interaction
- signup after preview
- portfolio creation
- portfolio analysis/refresh interactions that are already wired to the analytics boundary

Keep the existing privacy-safe analytics boundary; do not send raw sensitive portfolio/user data to analytics.

## 8. First production-day monitoring

Watch for:

- anonymous preview error rate
- signup conversion after preview
- portfolio transaction errors
- portfolio snapshot failures
- analysis-provider partial failures
- mobile layout/support complaints
- Stripe/auth regressions unrelated to the upgrade

## Rollback rule

If the web release has a serious regression, revert the StockBox 2.0 merge/deployment first.

The Portfolio 2 database migration is additive and backfills existing data. Do not immediately drop the new transaction/snapshot tables during an emergency rollback; keep the data intact and restore application compatibility first.
