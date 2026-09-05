# StockBox 2.0 upgrade baseline

Baseline audited: `main` at `628d33b4606a0d3aae5953635f056289893b54cc` on 2026-09-05.
Upgrade branch: `upgrade/stockbox-2-ux-portfolio-mobile-20260905`.

This document records the architecture and key findings that existed before the UX/conversion/portfolio implementation work in this upgrade branch. The work is intentionally scoped to `alstockbox/stockbox-2.0`; no StockBox 3.0 branch is an implementation target.

## Architecture

- **Framework:** Next.js App Router, React, TypeScript.
- **Authentication:** Supabase Auth with server-side session helpers and PKCE flows.
- **Database:** Supabase/PostgreSQL, migrations as schema source of truth, RLS on user-owned workspace data.
- **Analysis:** authenticated `/api/analysis` route backed by the universal security provider/orchestration layer, deterministic StockBox scoring and persisted reports.
- **Financial data:** provider orchestration plus explicit unavailable/degraded states; no fabricated missing values. ECB FX utilities are available for normalized comparisons.
- **Portfolio before upgrade:** `portfolios` plus aggregate `holdings` rows (`ticker`, `quantity`, `average_cost`, `currency`, `acquired_at`). There was no transaction ledger or portfolio snapshot model.
- **Billing:** Stripe Checkout/webhooks and entitlement/quota logic.
- **Analytics:** PostHog-compatible allowlisted server/client event boundary with hashed user identifiers and property sanitization.
- **Security:** CSP/security headers, RLS, server-only service-role access, distributed rate limiting and input validation.
- **Deployment:** Vercel web application + Supabase database/auth; production migrations are run before traffic is exposed.

## Key pre-upgrade findings

1. The landing hero did not make the primary value proposition and next action sufficiently obvious in the first viewport.
2. Anonymous visitors could not genuinely begin a StockBox analysis because the full analysis endpoint correctly required authentication.
3. There was no product-demo video integration.
4. Signup/auth itself was already relatively short and hardened; the larger friction was routing users to value after signup/onboarding.
5. Portfolio stored an aggregate holding rather than individual dated purchases, making transaction-level cost basis/history impossible.
6. Portfolio update/delete relied primarily on RLS for ownership when given a holding ID; explicit parent-ownership validation was desirable as defense in depth.
7. Portfolio lacked current market value, P/L, normalized FX totals, StockBox signals, whole-portfolio weighting, refresh/progress, partial-failure handling and snapshots.
8. Mobile navigation existed as a menu, but there was no persistent task-oriented mobile navigation for authenticated users.
9. Shared buttons used a 40px target and had weaker focus treatment than desired for mobile/accessibility.
10. Analytics did not include the requested anonymous-analysis and portfolio-conversion funnel events.
11. Intro video cannot safely be assumed to exist; the integration must remain a configured placeholder until a real asset is supplied.

## Safety boundary

The upgrade reuses the existing authenticated analysis, entitlement, provider, auth, Stripe and RLS architecture instead of replacing it. Backward compatibility with existing `holdings` is preserved so the transaction model can be introduced without deleting existing customer portfolio data.
