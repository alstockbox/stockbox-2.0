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

- [x] Local release gate passes on the current working tree: 97/97 test files and 806/806 tests, TypeScript typecheck, ESLint with zero errors/warnings, Next.js production build, `git diff --check`, and local production smoke checks for public/auth-protected routes. Re-run the same gate on the final release commit after production-only configuration changes.
- [x] Run the diagnostic pre-batch live gauntlet and review entity, currency, provenance, specialist-data and recommendation safety; 22/22 diagnostic issuers completed with safe fail-closed behavior. This was not the official 25-company calibration batch.
- [x] Production migration history is synchronized through `20260829125157_atomic_ambassador_role_affiliate.sql`; new affiliate tables/columns exist with RLS enabled and authenticated roles are denied execution of privileged affiliate/payout/ambassador RPCs while `service_role` retains execution.
- [x] Production RLS runtime probe confirms user A cannot read user B profile, analyses, watchlist or portfolio; authenticated users cannot execute admin, Stripe-sync, workspace-entitlement or distributed-rate-limit service RPCs.
- [ ] Verify signup, email confirmation, login, logout and password recovery against production Auth.
- [ ] Verify Summary, Numbers and Deep reports against several real issuers, unsupported securities, stale market data, cross-currency data and missing-data cases.
- [x] Complete English/Swedish localization for P0 operational UI strings. Canonical engine-generated financial narrative/diagnostic terminology remains English to avoid semantic drift.
- [x] Add atomic Supabase-backed distributed rate limiting with hashed keys for auth-adjacent, search, analysis, batch validation and share endpoints, with process-local fallback as defense in depth.
- [ ] Validate production edge/WAF rate limiting across deployed instances.
- [ ] Verify Stripe test checkout, duplicate webhooks, upgrade, failed payment, cancellation and portal.
- [ ] Verify plan limits and ensure failed or fundamentals-unavailable analyses do not consume entitlement.
- [ ] Verify Strong Buy delivery and retry/dedup behavior through the selected email provider.
- [ ] Confirm PostHog payloads contain no secrets, report bodies or unnecessary personal data.
- [x] Add baseline HSTS and CSP headers.
- [x] Run dependency audit with no unresolved critical/high finding.
- [ ] Validate CSP in production browser QA and complete final security review with no unresolved critical/high finding.
- [ ] Run keyboard, screen-size, contrast, browser-console and Core Web Vitals QA.
- [ ] Owner/legal approves privacy, terms, financial disclosure, prices and refund/VAT rules.
- [ ] Production deployment passes the complete HTTPS smoke test.

## Release decision

`BLOCKED BY SPECIFIC ITEMS`: all unchecked gates above plus the credentials in `OWNER_ACTIONS.md`. Do not activate paid traffic until they pass.
