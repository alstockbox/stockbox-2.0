# StockBox 2.0 Launch Checklist

Current date: August 29, 2026. Release deadline: August 31, 2026.

## Completed in the repository

- [x] Product architecture, feature matrix, security, methodology, deployment and owner-action documentation.
- [x] Public product surface, pricing, account flows, onboarding, dashboard, analysis, watchlist, portfolio, legal and admin routes.
- [x] Canonical entity validation, reporting/trading currency separation, period-aware growth, freshness gates and missing-data safety.
- [x] Deterministic metrics, archetype-aware scores, constrained recommendations, DCF assumption quality, cyclical normalization, scenarios and a 30-case golden invariant set.
- [x] Provider orchestration with SEC precedence, safe Yahoo supplementation, metric provenance, conflict gates and honest unavailable states.
- [x] Versioned model/policies/providers, canonical input fingerprints and batch-QA rerun comparison/persistence code.
- [x] Supabase schema, indexes, RLS policies and service-role boundaries.
- [x] Stripe Checkout/Portal/webhook code and centralized entitlements.
- [x] Affiliate/ambassador operations: admin-created ambassador accounts, per-account quota/commission/status, role-aware dashboard access, read-only admin preview, referral attribution, commission ledger, refund/chargeback reversal, Stripe Connect onboarding and payout execution code.
- [x] Settings/profile navigation cleanup plus persistent Contact/Feedback flows with server-side validation, rate limiting and admin queues.
- [x] Sanitized errors, product events and deduplicated Strong Buy alert code.
- [x] P1/P2 launch flags default closed.
- [x] Saved profile preferences initialize Analyze defaults, and a profile settings surface is available after onboarding.
- [x] Watchlist and holdings canonicalize company identity server-side before persistence; workspace plan limits are enforced through server/RPC boundaries.
- [x] User-facing sharing remains hidden for v1 until owner management/revocation UX is explicitly enabled and production-tested.
- [x] P0 operational UI is localized in English/Swedish, including auth server responses, navigation, Analyze, Batch, Watchlist, Portfolio, Billing and profile/settings copy; canonical financial model narrative remains English by design.
- [x] P0 accessibility regression coverage includes keyboard skip navigation, visible focus, reduced motion, semantic score/batch progress and non-duplicative chart semantics.
- [x] Analysis API provider failures are sanitized at the HTTP boundary while detailed provider diagnostics remain server-side for QA/logging.

## Required release gates

- [x] Local release gate passes on the current working tree: 100/100 test files and 816/816 tests, TypeScript typecheck, ESLint with zero errors/warnings, Next.js production build, `git diff --check`, and local production smoke checks for public/auth-protected routes. Re-run the same gate on the final release commit after production-only configuration changes.
- [x] Run the diagnostic pre-batch live gauntlet and review entity, currency, provenance, specialist-data and recommendation safety; 22/22 diagnostic issuers completed with safe fail-closed behavior. This was not the official 25-company calibration batch.
- [x] Production migration history is synchronized through `20260829135927_release_fk_indexes.sql`; new affiliate tables/columns exist with RLS enabled and authenticated roles are denied execution of privileged affiliate/payout/ambassador RPCs while `service_role` retains execution.
- [x] Production affiliate runtime probes pass without persistent QA data: ambassador entitlement returns the configured 100-analysis limit, atomic customer-to-ambassador role/profile mutation works inside a rolled-back transaction, and payout queuing fails closed with `not_enabled` before Stripe Connect onboarding.
- [x] Owner preview QA confirms Admin can create an ambassador, the ambassador can sign in directly with the temporary credentials, and the affiliate dashboard/role/quota flow works. Stripe Connect completion is deferred to the production domain because preview onboarding does not complete reliably there.
- [x] Production RLS runtime probe confirms user A cannot read user B profile, analyses, watchlist or portfolio; authenticated users cannot execute admin, Stripe-sync, workspace-entitlement or distributed-rate-limit service RPCs.
- [x] Vercel release Preview is configured with Supabase URL/publishable/server-side credentials; the account-unavailable fallback is gone and protected routes redirect anonymous users to login.
- [x] Production Auth passes signup creation, confirmation-email delivery/link consumption, login, logout/session invalidation and recovery-email delivery. Admin-created ambassador accounts are created with confirmed email and do not require a separate confirmation flow.
- [x] Live engine smoke passes AAPL Summary, MSFT Numbers, NVDA Deep and ASML cross-currency handling; SPY fails closed as unsupported ETF and INVE-B.ST returns No Rating under low coverage rather than fabricating a score.
- [x] Complete English/Swedish localization for P0 operational UI strings. Canonical engine-generated financial narrative/diagnostic terminology remains English to avoid semantic drift.
- [x] Add atomic Supabase-backed distributed rate limiting with hashed keys for auth-adjacent, search, analysis, batch validation and share endpoints, with process-local fallback as defense in depth.
- [x] Distributed limiter concurrency was verified on Preview; the final limiter code additionally fails closed if the shared Supabase RPC is unavailable. Later release commits changed only Admin UI/documentation, not limiter behavior.
- [x] Stripe Checkout/Portal has been owner-verified on the prior domain and webhook/idempotency are production-verified. Remaining action after merge: one quick getstockbox.app billing smoke to confirm domain redirects; not a pre-merge blocker.
- [x] Production entitlement probes confirm reserved usage is counted immediately, failed/released reservations do not consume usage, persisted Deep counts exactly once, and unsupported securities are rejected before quota reservation.
- [x] Strong Buy dedup/retry/failure handling is covered by 5/5 tests. Real Resend delivery is deferred until post-release because email alerts are not required for the launch path.
- [x] PostHog server events pass a central privacy boundary: user IDs are SHA-256 hashed and raw user IDs, emails, search free-text, internal IDs, tokens/secrets and report/body text are not forwarded.
- [x] Supabase leaked-password protection is unavailable on the current free plan; treat it as optional future hardening rather than a launch blocker.
- [x] Add baseline HSTS and CSP headers.
- [x] Run dependency audit with no unresolved critical/high finding.
- [ ] Validate CSP in production browser QA and complete final security review with no unresolved critical/high finding.
- [ ] Run keyboard, screen-size, contrast, browser-console and Core Web Vitals QA.
- [ ] Owner/legal approves privacy, terms, financial disclosure, prices and refund/VAT rules.
- [ ] Production deployment passes the complete HTTPS smoke test.

## Release decision

`BLOCKED BY SPECIFIC ITEMS`: all unchecked gates above plus the credentials in `OWNER_ACTIONS.md`. Do not activate paid traffic until they pass.
