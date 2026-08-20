# StockBox 2.0 Decisions

## ADR-001: One TypeScript application

Use Next.js App Router for UI and server routes. This minimizes launch-time operations while preserving explicit provider, analysis, billing, and repository boundaries.

## ADR-002: Supabase for PostgreSQL and authentication

Supabase provides PostgreSQL, cookie-compatible auth, migrations, and RLS on a low-cost starting tier. User ownership is enforced in the database and repeated in sensitive server routes.

## ADR-003: Deterministic research core

Financial arithmetic, normalization, DCF, scoring, confidence, recommendation gates, and flags run in typed code. AI is disabled by default and may later explain already-derived evidence through a provider-neutral interface.

## ADR-004: Free official fundamentals first

SEC Companyfacts is the initial fundamental source and Stooq is the initial end-of-day source. This keeps early cost near zero, but launch coverage is honestly limited mainly to US issuers and non-real-time prices.

## ADR-005: Stripe-hosted subscription surfaces

Use Checkout Sessions and the Customer Portal to reduce payment scope. The app omits explicit payment-method lists, verifies raw webhook signatures, and derives entitlements only from synchronized subscription state.

## ADR-006: Feature flags fail closed

News, batch execution, AI assistant, referrals, affiliates, and Stock Battle default off. Their schema or entitlement shape may exist without exposing incomplete workflows.

## ADR-007: Pricing is configuration

Plan limits live in one typed catalog and in the plans table. Current SEK prices are launch proposals and require owner confirmation before Stripe products are created.
