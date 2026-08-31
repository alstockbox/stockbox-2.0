# StockBox 2.0 Decisions

## ADR-001: One TypeScript application

Use Next.js App Router for UI and server routes. This minimizes launch-time operations while preserving explicit provider, analysis, billing, and repository boundaries.

## ADR-002: Supabase for PostgreSQL and authentication

Supabase provides PostgreSQL, cookie-compatible auth, migrations, and RLS on a low-cost starting tier. User ownership is enforced in the database and repeated in sensitive server routes.

## ADR-003: Deterministic research core

Financial arithmetic, normalization, DCF, scoring, confidence, recommendation gates, and flags run in typed code. AI is disabled by default and may later explain already-derived evidence through a provider-neutral interface.

## ADR-004: Verified provider chain first

SEC Companyfacts is the initial fundamental source. Twelve Data is the configured production market-data provider when a key is present, with Stooq retained only as an explicit end-of-day fallback. Missing provider data stays unavailable rather than falling back to fabricated values.

## ADR-005: Stripe-hosted subscription surfaces

Use Checkout Sessions and the Customer Portal to reduce payment scope. The app omits explicit payment-method lists, verifies raw webhook signatures, and derives entitlements only from synchronized subscription state.

## ADR-006: Feature flags fail closed

News, AI assistant and Stock Battle remain fail-closed/deferred. Batch, referrals and affiliate workflows are release features and must pass their own authorization, entitlement and production-smoke gates.

## ADR-007: Pricing is configuration

Plan limits and commercial status live in one typed catalog and in the plans table. Free, Basic, Standard, Pro (`premium`) and Elite are active. Paid launch pricing is 49→69, 79→119 and 159→179 SEK/month for Basic, Standard and Pro respectively; Elite is 399 SEK/month without launch pricing. A user can redeem one StockBox launch offer total. Affiliate commission is configured individually per affiliate in Admin; payouts run monthly with a 100 SEK minimum. Referred customers receive 10% off regular pricing when no better StockBox promotion applies; promotions do not stack.
