# StockBox 2.0 - Release Status / Owner Actions

Historical production verification was completed on 28 August 2026 at `5c8a4dd`. The current 31 August release candidate contains later commercial, legal, affiliate, entitlement and auth hardening and must be re-verified on its exact final commit before paid launch.

## Historically verified / currently implemented

1. **Analysis engine:** v2.7.0 is integrated on top of the current release-hardening/main code without merging the destructive calibration branch history. The engine remains deterministic, coverage-aware and fail-closed when data is insufficient.
2. **Historical code gates:** 91/91 test files and 846/846 tests passed at the 28 August v2.7 verification point. The current 31 August working release candidate has separately passed 158/158 test files, 1,231/1,231 tests, TypeScript, zero-warning ESLint, production build, `git diff --check`, and both dependency audits; those local results must still be tied to the exact final commit and deployed SHA.
3. **Vercel:** the v2.7 preview deployment completed successfully, then `5c8a4dd` was fast-forwarded to `main` and the production deployment completed successfully. The final production domain responds over HTTPS.
4. **DNS/domain:** `getstockbox.app` resolves to Vercel and redirects to `https://www.getstockbox.app/`; `www.getstockbox.app` serves the StockBox application with HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy headers.
5. **Production provider health:** `https://www.getstockbox.app/api/health/providers` returns HTTP 200. SEC is configured with an explicit user-agent/contact. Global market data resolves to Yahoo Finance with Stooq configured as fallback.
6. **Vercel runtime health:** no runtime errors were reported in the post-deploy observation window.
7. **Supabase:** production project `stockbox-production` is ACTIVE_HEALTHY. Production now has the current entitlement hardening and contract-confirmation delivery migrations applied and verified: centralized effective entitlements exist, ambassadors have no hidden fallback, contract-delivery RLS is enabled, and service-role-only RPC grants are in place.
8. **Database security:** RLS remains enabled. Supabase Security Advisor reports service-only deny-by-default tables as INFO. Leaked-password protection is unavailable on the current free Supabase plan and is explicitly deferred as a non-blocking paid-plan security enhancement.
9. **Billing model:** Free, Basic, Standard, Pro (`premium`) and Elite are active in application code. Basic is 49 SEK/month for 3 months then 69; Standard 79 then 119; Pro 159 then 179; Elite 399 with no launch offer. A customer may redeem only one StockBox launch offer total. Eligible affiliate referrals receive 10% off regular pricing when no better launch promotion applies; active affiliates have at least 20% commission excluding VAT/tax.
10. **Billing infrastructure:** Stripe Checkout, Billing Portal, signed webhook processing, duplicate/stale event protection, cancellation-state handling and centralized entitlements are implemented. The legacy duplicate billing webhook remains disabled.
11. **Admin / ambassador:** admin authorization, unlimited admin analysis behavior, affiliate/ambassador role support and custom ambassador entitlements are implemented; production migrations for the current entitlement model are present.
12. **Core product surface:** landing, pricing, signup/login/recovery, onboarding, dashboard, Analyze, Batch, History, Watchlist, Portfolio, Billing/Profile settings, Affiliate, Admin, Methodology, Privacy and Terms routes build successfully. Print/Save PDF is available from reports through the browser print flow.

## Remaining hard gates before a paid public launch

1. **Legal/commercial production configuration - BLOCKER.** Privacy and Terms are now publishable templates, but paid commerce must remain fail-closed until the production seller identity, organization number, postal address, support email/phone and verified VAT mode are configured. If VAT registered, the VAT number must also be configured. Resend/FROM_EMAIL must be production-ready so withdrawal receipts and the first-purchase durable contract confirmation can actually be delivered.
2. **Production Auth end-to-end - BLOCKER.** Verify a real signup -> confirmation email -> callback -> onboarding -> login -> logout -> forgot/reset password cycle on the final `www.getstockbox.app` domain. Confirm Supabase Auth Site URL and redirect allow-list match the final domain.
3. **Real billing end-to-end - BLOCKER FOR PAID LAUNCH.** With normal non-admin test customers, verify Basic/Standard/Pro launch checkout, Elite regular checkout, the global one-time launch rule, affiliate 10% regular-price discount without stacking, subscription activation, correct quotas, Billing Portal, cancellation, resubscribe and failed-payment behavior. Verify failed/fundamentals-unavailable analyses do not consume quota.
4. **Post-v2.7 report QA - BLOCKER.** Run real Summary/Numbers/Deep analyses across a representative issuer set including US mega-cap, Swedish/global stock, financial, REIT, cyclical/commodity, loss-making growth, cross-currency, stale/partial fundamentals and unsupported security cases. Review score, rating, confidence, provenance, DCF gating and missing-data behavior. Do not tune to preferred company ratings.
5. **Browser/device QA - BLOCKER.** Verify mobile/tablet/desktop layouts, keyboard/focus, contrast, browser console, print/PDF, Batch progress/retry, History persistence and admin-denial behavior in real browsers.
6. **Production abuse/telemetry QA - BLOCKER.** Validate deployed rate limiting/WAF behavior across instances, inspect PostHog payloads for allowlisted non-sensitive data only, and verify Strong Buy email delivery/retry/dedup against the configured email provider.
7. **Final release smoke - BLOCKER.** After the above gates, run the complete HTTPS route smoke, one fresh customer journey and one fresh analysis/batch journey, then make the explicit GO/NO-GO decision.

## Deliberately deferred / not launch blockers

Supabase leaked-password protection is deferred until a plan upgrade because it is not available on the current free plan. Existing password policy, Auth flows, RLS and application security remain launch requirements.

Screener, news ingestion, Stock of the Day, automated portfolio monitoring, advanced portfolio analytics, AI research/assistant, transcripts, advanced sentiment, funds/crypto and Stock Battle remain P1/P2 unless they are explicitly promised in launch marketing. Company/report comparison is part of v1 and therefore belongs in production smoke testing. Do not expand scope before v1 is stable.

## Current release decision

**TECHNICAL CORE: NEAR RELEASE-READY. PAID PUBLIC LAUNCH: STILL BLOCKED BY THE HARD GATES ABOVE.**

The dominant remaining work is external/end-to-end verification and legal/commercial approval, not another large product rewrite.
