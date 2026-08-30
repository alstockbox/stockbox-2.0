# StockBox 2.0 Feature Matrix

Current date: August 28, 2026. Release deadline: August 31, 2026.
Current production analysis engine: `stockbox-analysis-engine-v2.7.0`.

## P0

| Area | Current status | Release note |
| --- | --- | --- |
| Public site and SEO | Live, final QA pending | Landing, pricing, auth, legal, sitemap, robots, metadata and responsive shell are deployed on `www.getstockbox.app`. Search-engine caches may still show the legacy Coming Soon page until recrawled. |
| Authentication | Built, production E2E pending | Supabase SSR, PKCE callback, signup/login/logout/forgot/reset exist. Final-domain confirmation/reset flows and Auth redirect allow-list still require end-to-end verification. |
| Authorization | Built and production-RLS verified | Server admin gates, ownership checks, service-role boundaries and privileged RPC restrictions are implemented. |
| Onboarding and profiles | Built | Simple/Pro experience and investment-profile defaults persist and initialize Analyze; profile settings are available. |
| English/Swedish | Built for P0 operational UI | Navigation, auth, Analyze, Batch, Watchlist, Portfolio, Billing and settings are localized. Canonical financial-model narrative remains English by design. |
| Search and live analysis | Built and deployed | Canonical entity validation, SEC fundamentals, Yahoo global market data with Stooq fallback, provenance/conflict handling and fail-closed unavailable states are deployed. Final post-v2.7 issuer sweep remains. |
| Scores, recommendations and flags | Built and v2.7 deterministic-tested | Versioned engine, coverage gates, financial/REIT specialist handling, valuation-gated directional ratings, confidence and missing-data behavior are implemented. |
| DCF and scenarios | Built and deterministic-tested | Per-share FCFF, freshness/currency gates, bounded assumptions, terminal-value risk controls and illustrative-only fallback behavior are implemented. |
| Reproducibility and batch QA | Built; production schema current | Fingerprints, model/policy/provider versions, persisted QA metadata, rerun deltas, analysis idempotency and batch persistence are implemented. |
| Saved reports / History | Built | User-owned analysis persistence and History are exposed. Tokenized sharing backend exists, while end-user sharing management remains intentionally hidden for v1. |
| Print / PDF | Built via browser print flow | Reports expose Print / Save PDF; final cross-browser print-layout QA remains. |
| Watchlist and portfolio core | Built | Private CRUD, canonical tickers/currencies and plan entitlements are implemented. Automated monitoring and advanced analytics remain deferred. |
| Batch analysis | Built, final production UI QA pending | Validation, plan limits, idempotency, failure continuation/retry support and QA persistence exist. Final real browser/customer verification remains. |
| Usage limits | Built, final customer E2E pending | Monthly/deep/batch/watchlist/portfolio entitlements are centralized. Admin has unlimited analysis behavior; ambassadors support custom entitlements. |
| Stripe subscriptions | Built and production configured, customer E2E pending | Checkout, portal, signed webhook, ordering/idempotency, launch offer and cancellation-state handling are implemented. Free + Basic are commercially active; paid customer lifecycle still requires a final real run. |
| Admin operations | Built for current v1 operations | Server-authorized analysis diagnostics, roles, affiliate/ambassador workspace and custom ambassador entitlements are implemented. Nonessential broader admin tooling can remain post-launch. |
| Affiliate / ambassador | Built for current v1 scope | Referral attribution, dashboard/workspace logic, ambassador role and configurable entitlements are present; final production role/UX smoke remains. |
| Analytics and errors | Built, production payload inspection pending | Allowlisted PostHog events, sanitized provider/API errors and database error handling exist. Inspect real production payloads before paid traffic. |
| Strong Buy email | Built, provider E2E pending | Delivery reservation/retry/dedup logic exists; real provider delivery remains a launch gate if the feature is enabled at launch. |
| Security | Strong technical baseline; browser/WAF QA remains | CSP/HSTS/security headers, RLS, validation, webhook signatures, distributed rate limiting and sanitized errors are in place. Supabase leaked-password protection is unavailable on the current free plan and is deferred as a non-blocking paid-plan enhancement. |
| Deployment / domain | Live | Vercel production is live, apex redirects to `www`, provider health returns 200 and production DNS is cut over. |
| Legal / commercial | BLOCKED | Privacy and Terms remain explicit drafts and must be finalized before intentional paid public traffic. |

## Commercial plan surface at launch

Only **Free** and **Basic** are currently active in application code. Basic is 79 SEK/month with a launch price of 49 SEK/month for the first 3 months. Standard, Premium and Elite remain inactive and should not be presented as purchasable until intentionally enabled and end-to-end tested.

## P1 - defer until after stable v1

Comparisons, screener, news ingestion, Stock of the Day, analysis-change monitoring, enhanced portfolio analytics, social cards and AI research/assistant.

## P2 - defer

Transcript analysis, advanced sentiment, outcome/backtest calibration, additional provider expansion, funds, crypto and Stock Battle.

## Scope rule

A deferred feature is not a release blocker if it is not linked, sold or promised in launch marketing. Do not expand v1 scope during final hardening.

## Release status

`TECHNICAL CORE: NEAR RELEASE-READY.`

`PAID PUBLIC LAUNCH: BLOCKED` by legal finalization plus the remaining production Auth, billing, browser/device, abuse/telemetry and post-v2.7 real-report verification gates documented in `LAUNCH_CHECKLIST.md` and `OWNER_ACTIONS.md`.
