# StockBox 2.0 Feature Matrix

Current date: August 20, 2026. Release deadline: August 31, 2026.

## P0

| Area | Status | Release note |
| --- | --- | --- |
| Public site and SEO | Built locally | Landing, pricing, auth, legal, sitemap, robots, metadata, responsive shell. |
| Authentication | Built, external verification required | Supabase SSR, PKCE callback, signup/login/logout/reset. |
| Authorization | Built, migration test required | Server admin gate, owner checks, service-role separation, RLS migration. |
| Onboarding and profiles | Built locally | Experience selects Simple/Pro default; profile persists and drives weights. |
| English/Swedish | Partial | Locale detection/switch/persistence exist; several operational strings remain English. |
| Search and live analysis | Built, provider verification required | SEC Companyfacts plus Stooq; no fake fallback. Initial coverage is mainly US equities. |
| Scores, recommendations, flags | Built and unit-tested | Deterministic, missing-data aware, sector/profile weighting in full engine. |
| DCF and scenarios | Built and unit-tested | Full per-share DCF core; compact live adapter currently exposes an FCF value proxy. |
| Saved reports and sharing | Built, RLS test required | User-owned persistence and private-to-public token route with expiry/revoke support. |
| Watchlist and portfolio core | Built locally | Private CRUD foundations; automated alerts and live portfolio valuation are not enabled. |
| Usage limits | Built, integration test required | Monthly and deep-analysis limits derived from synchronized plan state. |
| Stripe subscriptions | Built, external configuration required | Checkout, portal, signed webhook and subscription sync. Live billing not activated. |
| Admin operations | Partial | Server-authorized provider readiness and core counts; mutation tools/cost drilldowns remain hidden. |
| Analytics and errors | Built, external verification required | Allowlists PostHog funnel events and sanitized database error logging. |
| Strong Buy email | Built, external verification required | Resend delivery with unique analysis reservation and retry release. |
| Security | Partial | Headers, validation, RLS, ownership, webhook signatures; rate limiting/CSP/security test pass remain. |
| Deployment | Not live | Vercel/Supabase/Stripe ownership and credentials are required. |

## P1

News ingestion, comparisons, screener, Stock of the Day, analysis-change monitoring, enhanced portfolio analytics, social cards, and AI research remain disabled until real licensed inputs and end-to-end tests exist.

## P2

Transcript analysis, advanced sentiment, backtested outcome calibration, global provider failover, funds, crypto, and Stock Battle remain disabled.

## Flag rule

News, batch execution, AI assistant, referrals, affiliates, and Stock Battle default off. A disabled route may explain launch state when opened directly, but it is not linked as an available capability.

## Release status

`BLOCKED`: local implementation exists, but production credentials, migrations, payment setup, legal approval, browser QA, localization completion, rate limiting, and production smoke tests are outstanding.
