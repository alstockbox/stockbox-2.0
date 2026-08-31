# StockBox 2.0 Launch Checklist

Current date: August 31, 2026. Release deadline: August 31, 2026.
Current release candidate: later than the 28 August `5c8a4dd` verification point. The current working tree has passed 158/158 test files (1,231/1,231 tests), TypeScript, zero-warning ESLint, production build, `git diff --check`, and both dependency audits. Record the exact final commit after the reviewed tree is committed.

## Repository and production foundation

- [x] Public product shell, pricing, auth routes, onboarding, dashboard, Analyze, Batch, History, Watchlist, Portfolio, Affiliate, Admin, settings, methodology and legal routes exist and build.
- [x] Analysis Engine v2.7 integrated without merging the divergent calibration branch wholesale.
- [x] Canonical entity/currency handling, missing-data safety, provenance/conflict handling, deterministic scoring, DCF gates, confidence/coverage and specialist archetype logic are implemented.
- [x] Supabase persistence, RLS/service-role boundaries, analysis idempotency, distributed rate limits, batch QA persistence and affiliate/ambassador entitlement migrations exist in the repository.
- [x] Apply and verify all production migrations through `20260830220500_contract_confirmation_delivery.sql`.
- [x] Stripe Checkout/Portal/webhook code, ordering/idempotency protections, subscription lifecycle and launch-offer logic are implemented.
- [x] Admin unlimited analysis behavior and custom ambassador entitlement support are implemented.
- [x] English/Swedish P0 operational localization and baseline accessibility/security headers are implemented.
- [x] Final DNS cutover completed: apex redirects to `www`, and `www.getstockbox.app` serves Vercel production over HTTPS.
- [x] Production provider health returns HTTP 200 with SEC configured and Yahoo -> Stooq market-provider chain.

## Historical v2.7 verification point

- [x] 91/91 test files pass.
- [x] 846/846 tests pass.
- [x] TypeScript typecheck passes.
- [x] ESLint passes.
- [x] Next.js production build passes and generates the full current route set.
- [x] `git diff --check` passes.
- [x] `npm audit --omit=dev` reports 0 vulnerabilities.
- [x] Full `npm audit` reports 0 vulnerabilities.
- [x] v2.7 preview deployment completed successfully.
- [x] v2.7 was fast-forwarded to `main` and production deployment completed successfully.
- [x] Post-deploy provider-health smoke returns HTTP 200.
- [x] No Vercel runtime errors observed in the post-deploy window.

## Required release gates still open

- [ ] Configure and verify production legal identity: business name, organization number, postal address, support email/phone and VAT mode; add VAT number when applicable.
- [ ] Verify Privacy and Terms render the configured production identity/VAT state correctly on the final domain.
- [ ] Configure and verify Resend/FROM_EMAIL delivery for withdrawal receipts and first-purchase durable contract confirmations.
- [ ] Verify Supabase Auth Site URL and redirect allow-list use `https://www.getstockbox.app` and required callback/reset URLs.
- [ ] Run a real production signup -> email confirmation -> onboarding -> login -> logout flow.
- [ ] Run a real forgot-password -> email -> callback -> password update -> login flow.
- [ ] Run a representative post-v2.7 real-report sweep across Summary, Numbers and Deep modes, including global/Swedish, financial, REIT, cyclical, loss-making, cross-currency, stale/partial and unsupported cases.
- [ ] Confirm no failed/fundamentals-unavailable analysis consumes quota and no retry double-consumes quota.
- [ ] Validate deployed distributed rate limiting / WAF behavior across production instances.
- [ ] Run real Basic, Standard and Pro launch checkout flows plus Elite regular checkout; verify activation, quotas and Billing Portal.
- [ ] Verify the launch offer can be redeemed only once total per customer across paid plans.
- [ ] Verify eligible affiliate referrals receive 10% off regular pricing only when no better StockBox launch promotion applies, with no discount stacking.
- [ ] Submit a real withdrawal request and verify persistence, admin visibility and receipt email delivery.
- [ ] Verify cancellation, resubscribe and failed-payment lifecycle with a normal non-admin customer.
- [ ] Verify PostHog production payloads contain only allowlisted non-sensitive event properties.
- [ ] Verify Strong Buy email delivery, retry and dedup behavior through the configured email provider.
- [ ] Run mobile/tablet/desktop browser QA, keyboard/focus/contrast QA and browser-console review.
- [ ] Verify Print / Save PDF layout on representative Summary/Numbers/Deep reports.
- [ ] Verify Batch progress, continuation on failure, retry-only-failures, History persistence, Compare (up to three saved reports) and admin/customer authorization in production UI.
- [ ] Run the complete final HTTPS/customer-journey smoke after all items above are green.

## Scope freeze for v1

Supabase leaked-password protection is a non-blocking post-launch security enhancement until the Supabase plan is upgraded.

Screener, news, Stock of the Day, automated portfolio monitoring, advanced portfolio analytics, AI research/assistant, transcripts, advanced sentiment, funds/crypto and Stock Battle remain deferred unless launch marketing explicitly promises them. Company/report comparison is part of v1 and must pass production smoke testing.

## Release decision

`NO-GO FOR PAID PUBLIC TRAFFIC` until every open hard gate above is either verified green or explicitly removed from v1 scope with matching product/marketing changes.

`TECHNICAL CORE` is now in final release-hardening rather than feature construction.
