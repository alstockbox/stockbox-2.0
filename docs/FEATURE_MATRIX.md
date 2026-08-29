# StockBox 2.0 Feature Matrix

Current date: August 29, 2026. Release deadline: August 31, 2026.

## P0

| Area | Status | Release note |
| --- | --- | --- |
| Public site and SEO | Built locally | Landing, pricing, auth, legal, sitemap, robots, metadata, responsive shell. |
| Authentication | Built, external verification required | Supabase SSR, PKCE callback, signup/login/logout/reset. |
| Authorization | Built and production-RLS verified | Server admin gate, owner checks and service-role separation are implemented; production runtime probes verified user A/user B isolation and rejection of authenticated access to privileged RPCs. |
| Onboarding and profiles | Built locally | Experience selects Simple/Pro default; saved UI mode and investment profile initialize Analyze; users can edit profile defaults under settings. |
| English/Swedish | Built for P0 operational UI | Locale detection, switch and persistence cover navigation, auth (including server responses), Analyze, Batch, Watchlist, Portfolio, Billing and profile/settings UI. Canonical financial model narrative/diagnostic terminology remains English by design. |
| Search and live analysis | Built, live gauntlet reviewed locally | Server-canonical entity validation; SEC/Yahoo orchestration with safe supplementation, conflicts and metric provenance; 22/22 diagnostic issuers completed without provider crashes; unsupported/unsafe cases remain blocked or No Rating. |
| Scores, recommendations, flags | Built and deterministic-tested | Versioned canonical engine with explicit coverage, archetype-specific bank/insurer/REIT handling, unknown-method No Rating, and valuation-gated directional ratings. |
| DCF and scenarios | Built and deterministic-tested | Per-share FCFF with current shares, freshness/currency gates, versioned assumption quality, cyclical normalization and illustrative-only fallback-heavy output. |
| Reproducibility and batch QA | Built; production schema synchronized | Canonical input fingerprints, model/policy/provider versions, persisted QA score/rating metadata and rerun deltas are implemented. Repository and production migration history are synchronized through `20260829125157_atomic_ambassador_role_affiliate.sql`. |
| Saved reports and sharing | Backend built; sharing UI hidden for v1 | User-owned persistence and tokenized share backend exist with ownership/expiry/revoke safeguards. No user-facing share creation/management UI is exposed for v1. |
| Watchlist and portfolio core | Built locally | Private CRUD, canonical ticker resolution, explicit currencies and server-side plan entitlements are implemented; automated alerts and live portfolio valuation are not enabled. |
| Usage limits | Built, integration test required | Monthly and deep-analysis limits derive from synchronized plan state; ambassador quotas support per-account monthly limits. |
| Stripe subscriptions + affiliate payouts | Live Stripe configuration present; E2E human verification required | Basic 2.0 recurring price is live at 79 SEK/month, the valid launch coupon produces 49 SEK/month for three months, and the active webhook is subscribed to the exact subscription/payment/refund/dispute events handled by StockBox. Affiliate Connect onboarding/payout still requires a real ambassador E2E. |
| Admin operations | Built for v1; production DB boundaries verified | Admin can create ambassadors, set commission/quota/status, preview affiliate dashboards read-only, manage feedback/contact queues and inspect provider/system readiness. Privileged affiliate/admin RPC execution is service-role-only in production; final browser flow QA remains. |
| Analytics and errors | Built, external verification required | Allowlisted PostHog funnel events, sanitized database errors and sanitized provider-failure HTTP responses are implemented; production payload inspection remains required. |
| Strong Buy email | Built, external verification required | Resend delivery with unique analysis reservation and retry release. |
| Security | Built; production DB verified, edge/browser verification remains | Headers, validation, RLS/ownership, webhook signatures, atomic Supabase-backed distributed rate limiting with hashed keys, sanitized API/provider errors and CSP/HSTS are implemented. Production DB migrations/RLS/RPC grants were runtime-probed; Vercel WAF/CSP browser QA and Supabase leaked-password protection remain external gates. |
| Deployment | Production exists; new release candidate pending | Vercel project, GitHub integration and both production domains already exist. Current production predates today's affiliate/Settings release changes, so a new verified release candidate must be deployed before launch GO. |

## P1

News ingestion, comparisons, screener, Stock of the Day, analysis-change monitoring, enhanced portfolio analytics, social cards, and AI research remain disabled until real licensed inputs and end-to-end tests exist.

## P2

Transcript analysis, advanced sentiment, backtested outcome calibration, global provider failover, funds, crypto, and Stock Battle remain disabled.

## Flag rule

News, AI assistant and Stock Battle default off. Public affiliate/referral discovery remains closed behind release controls, while the role-gated ambassador dashboard and first-touch referral plumbing are implemented for invited ambassadors. Batch analysis remains subject to server-side plan/role limits and production QA.

## Release status

`BLOCKED BY HUMAN/PRODUCTION QA`: core implementation, production database migrations, live Basic pricing/coupon, Stripe webhook event configuration, production provider health and domain wiring are in place. Remaining gates are the new release-candidate deployment, Supabase leaked-password protection, real Connect/payout E2E, provider licensing approval, legal/commercial approval, production browser/device QA and edge/security smoke tests.
