# StockBox 2.0 Launch Checklist

Current date: August 20, 2026. Release deadline: August 31, 2026.

## Completed in the repository

- [x] Product architecture, feature matrix, security, methodology, deployment and owner-action documentation.
- [x] Public product surface, pricing, account flows, onboarding, dashboard, analysis, watchlist, portfolio, legal and admin routes.
- [x] Deterministic metrics, sector/profile scores, constrained recommendations, DCF, scenarios and known-result tests.
- [x] Provider abstraction with real SEC/Stooq data and honest unavailable states.
- [x] Supabase schema, indexes, RLS policies and service-role boundaries.
- [x] Stripe Checkout/Portal/webhook code and centralized entitlements.
- [x] Sanitized errors, product events and deduplicated Strong Buy alert code.
- [x] P1/P2 launch flags default closed.

## Required release gates

- [ ] Install/build/test/lint/typecheck pass on the release commit.
- [ ] Apply migration and test user A/user B isolation plus admin rejection.
- [ ] Verify signup, email confirmation, login, logout and password recovery against production Auth.
- [ ] Verify Summary, Numbers and Deep reports against several real issuers and missing-data cases.
- [ ] Complete Swedish translation for every visible operational string.
- [ ] Add rate limiting for auth-adjacent, search, analysis and share endpoints.
- [ ] Verify Stripe test checkout, duplicate webhooks, upgrade, failed payment, cancellation and portal.
- [ ] Verify plan limits and ensure failed analyses do not consume entitlement.
- [ ] Verify Strong Buy delivery and retry/dedup behavior through the selected email provider.
- [ ] Confirm PostHog payloads contain no secrets, report bodies or unnecessary personal data.
- [ ] Add/validate CSP and run dependency/security review with no unresolved critical/high finding.
- [ ] Run keyboard, screen-size, contrast, browser-console and Core Web Vitals QA.
- [ ] Owner/legal approves privacy, terms, financial disclosure, prices and refund/VAT rules.
- [ ] Production deployment passes the complete HTTPS smoke test.

## Release decision

`BLOCKED BY SPECIFIC ITEMS`: all unchecked gates above plus the credentials in `OWNER_ACTIONS.md`. Do not activate paid traffic until they pass.
