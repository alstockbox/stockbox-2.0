# StockBox 2.0 - Release Status / Owner Actions

Verified against production on 28 August 2026. Verified application code: `9484afe` (`Harden global market data fallback`).

## Verified complete

1. **Code gates:** 77/77 test files and 753/753 tests pass; typecheck, lint and production build exit 0; production and full npm audits report 0 vulnerabilities.
2. **Vercel:** production deployment for `9484afe` is READY. `stockbox-2-0.vercel.app` serves the current app. Runtime smoke window has no warning/error/fatal logs.
3. **Market data:** production primary is Yahoo Finance chart data with Stooq fallback. Provider health resolves `yahoo-chart`, reports global market-data capability and keeps Stooq configured as fallback. Swedish/global search smoke passed.
4. **SEC/fundamentals:** SEC contact is explicitly configured. Missing/unsupported fundamentals remain visible as missing rather than fabricated.
5. **Supabase:** all 12 repository migrations are applied through `20260827180007_distributed_rate_limits.sql` in order. Production project is healthy.
6. **Database security:** RLS is enabled on all public tables. Runtime authenticated isolation verified that a real user cannot read another user's profiles, analyses or subscriptions.
7. **Privileged RPCs:** entitlement, billing-ordering, workspace and rate-limit SECURITY DEFINER functions are not executable by `anon`/`authenticated`; intended public RPCs are service-role only.
8. **Rate limiting:** production distributed limiter passed an atomic allow/allow/deny test with rollback.
9. **Batch QA:** production batch-QA insert/update/read persistence passed under service role with rollback.
10. **Stripe:** live Basic v2 price is 79 SEK/month. Launch coupon reduces it by 30 SEK for exactly 3 months, producing 49 SEK/month for the first 3 months. Vercel points to the correct v2 price/coupon IDs.
11. **Stripe webhook:** the Vercel subscription webhook is enabled for subscription created/updated/deleted. Invalid-signature probes return HTTP 400 without DB mutation. Duplicate, stale-event and stale-subscription ordering passed against production with rollback.
12. **Legacy billing webhook:** the old `getstockbox.app/api/v1/billing/webhook` Stripe endpoint has been disabled (not deleted), removing duplicate-processing risk.

## Remaining before public launch

1. **DNS cutover at STRATO:** Vercel's project-specific inspection requires `A getstockbox.app 76.76.21.21` and `A www.getstockbox.app 76.76.21.21`. Current DNS still points to the legacy Coming Soon host (`216.24.57.1`). Change DNS only when ready to expose the app publicly, then re-run HTTPS/domain smoke.
2. **Legal/commercial approval:** Privacy and Terms are still explicit drafts. Owner/legal input is required for controller/company identity, contact details, lawful bases, retention, international transfers, VAT/refund/trial treatment, governing law and final disclaimer. Do not publish the current draft notices as final legal terms.
3. **Supabase Auth:** security advisor reports Leaked Password Protection disabled. If the project plan supports it, enable **Authentication > Email/password settings > Prevent the use of leaked passwords**, then re-run the security advisor. Also review minimum password requirements before launch.
4. **Final human QA:** manually test mobile/tablet/desktop layout, keyboard/focus/contrast, browser console, signup/login/reset/recovery, canonical security selection, saved analyses/watchlist/portfolio persistence, Basic checkout + billing portal, customer denial from admin routes, and a real cancellation/resubscribe lifecycle.
5. **DNS-dependent auth:** after DNS cutover, verify Supabase Auth Site URL/redirect allow-list and all email links use the final production domain rather than a temporary Vercel URL.

## Non-blocking observations

- Supabase performance advisor reports INFO-only unindexed foreign keys and currently-unused indexes. These should be reviewed after release using real workload/query data rather than changed immediately before launch.
- Service-only tables with RLS enabled and no policies are intentionally deny-by-default; this is not the same as missing RLS protection.
- Twelve Data remains optional. Production no longer depends on a missing Twelve Data API key because Yahoo is the active global market provider and Stooq is the configured fallback.
