# StockBox 2.0 Feature Matrix

Current date: August 27, 2026. Release deadline: August 31, 2026.

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
| Reproducibility and batch QA | Built; production schema applied | Canonical input fingerprints, model/policy/provider versions, persisted QA score/rating metadata and rerun deltas are implemented; production schema is migrated through `20260827180007`. |
| Saved reports and sharing | Backend built; sharing UI hidden for v1 | User-owned persistence and tokenized share backend exist with ownership/expiry/revoke safeguards. No user-facing share creation/management UI is exposed for v1. |
| Watchlist and portfolio core | Built locally | Private CRUD, canonical ticker resolution, explicit currencies and server-side plan entitlements are implemented; automated alerts and live portfolio valuation are not enabled. |
| Usage limits | Built, integration test required | Monthly and deep-analysis limits derived from synchronized plan state. |
| Stripe subscriptions | Built, external configuration required | Checkout, portal, signed webhook and subscription sync. Live billing not activated. |
| Admin operations | Partial | Server-authorized provider attempts, winners, fallbacks, conflicts, missing data, classification, timing, currency, specialist coverage and valuation support are available in admin analysis payloads; broader mutation tools remain hidden. |
| Analytics and errors | Built, external verification required | Allowlisted PostHog funnel events, sanitized database errors and sanitized provider-failure HTTP responses are implemented; production payload inspection remains required. |
| Strong Buy email | Built, external verification required | Resend delivery with unique analysis reservation and retry release. |
| Security | Built; production DB verified, edge/browser verification remains | Headers, validation, RLS/ownership, webhook signatures, atomic Supabase-backed distributed rate limiting with hashed keys, sanitized API/provider errors and CSP/HSTS are implemented. Production DB migrations/RLS/RPC grants were runtime-probed; Vercel WAF/CSP browser QA and Supabase leaked-password protection remain external gates. |
| Deployment | Not live | Vercel/Supabase/Stripe ownership and credentials are required. |

## P1

News ingestion, comparisons, screener, Stock of the Day, analysis-change monitoring, enhanced portfolio analytics, social cards, and AI research remain disabled until real licensed inputs and end-to-end tests exist.

## P2

Transcript analysis, advanced sentiment, backtested outcome calibration, global provider failover, funds, crypto, and Stock Battle remain disabled.

## Flag rule

News, AI assistant, referrals, affiliates, and Stock Battle default off. Batch analysis is enabled locally but remains subject to plan limits, server-side validation and production QA. A disabled route may explain launch state when opened directly, but it is not linked as an available capability.

## Release status

`BLOCKED`: local implementation and P0 operational localization are complete enough for production integration, but production credentials, migrations, payment setup, legal approval, browser QA, production edge rate limiting, and production smoke tests are outstanding.
