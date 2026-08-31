# StockBox 2.0 Architecture

## System shape

- Next.js 16 App Router renders public and authenticated surfaces.
- Server Components read sessions and user-owned data; Client Components are limited to interactive search, forms, charts, and checkout redirects.
- Supabase Auth uses cookie-backed PKCE sessions through `@supabase/ssr`.
- Supabase PostgreSQL stores normalized accounts, billing state, reports, sources, scores, watchlists, portfolios, jobs, usage, errors, and audit records.
- Stripe Checkout creates subscriptions; signed webhooks are the source of truth for entitlement state.
- PostHog receives a small allowlisted product-event vocabulary without report bodies or secrets.
- SEC Companyfacts supplies US filing facts, Twelve Data supplies production market data when configured, and Stooq remains an explicit end-of-day fallback. Provider modules are isolated under `src/lib/data`.

## Analysis flow

`Company search → validated authenticated API request → entitlement reservation → SEC and configured market-provider chain in parallel → raw provider types → deterministic metrics → weighted scores → flags and confidence/coverage gates → neutral research view → scenarios/DCF → persisted report → source-visible UI`

Provider failure never falls back to fabricated values. Partial results carry warnings; fully missing results fail visibly.

## Trust boundaries

- Browser: publishable Supabase values and PostHog project key only.
- Authenticated server client: cookie identity plus RLS.
- Service-role client: persistence, Stripe webhooks, admin aggregates, and background operations only.
- External providers: fixed allowlisted endpoints assembled by server code; users cannot submit arbitrary URLs.
- Admin: allowlisted identity is checked server-side; sensitive future mutations must also write `audit_logs`.

## Deployment

Vercel hosts the Next.js application. Supabase owns database/auth. The migration in `supabase/migrations` is the schema source of truth. Provider-specific configuration lives in environment variables; secrets are never exposed through `NEXT_PUBLIC_*` names.
