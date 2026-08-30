# Commercial Plans & Ambassador Giveaways Design

**Status:** Approved in chat on 2026-08-30.

## Goal
Ship the full StockBox commercial ladder and an admin-controlled ambassador giveaway system without weakening Stripe billing, quota enforcement, affiliate accounting, or existing subscriptions.

## Approved pricing
| Plan | Launch | Regular | Analyses |
|---|---:|---:|---:|
| Free | 0 SEK | 0 SEK | 5 in first 30 days, then 3/month |
| Basic | 49 SEK/month for 3 months | 69 SEK/month | 10/month |
| Standard | 79 SEK/month for 3 months | 119 SEK/month | 35/month |
| Pro (`premium` internally) | 159 SEK/month for 3 months | 179 SEK/month | 90/month |
| Elite | none | 399 SEK/month | 350/month |

## Plan architecture
Keep the existing internal plan keys `free`, `basic`, `standard`, `premium`, `elite`. The `premium` key is customer-facing as **Pro** so existing database/API contracts remain compatible. All paid plans use flat monthly Stripe Billing subscriptions.

Launch offers are repeating fixed-amount Stripe coupons for exactly three billing months. A user can redeem the StockBox launch offer only once across paid plans; upgrading later does not create a second launch discount.
## Entitlements
The approved analysis quotas are authoritative. Supporting limits step up conservatively with each tier and do not advertise unfinished capabilities:
- Free: 1 deep, 5 watchlist, no batch, 1 portfolio.
- Basic: 3 deep, 20 watchlist, batch 10, 2 portfolios.
- Standard: 12 deep, 75 watchlist, batch 25, 5 portfolios.
- Pro: 35 deep, 250 watchlist, batch 50, 15 portfolios.
- Elite: 150 deep, 1000 watchlist, batch 50, 50 portfolios.

Free onboarding quota is a rolling 30-day window beginning at `profiles.created_at`. During that window total analysis allowance is 5. After it expires the normal calendar-month Free allowance is 3. This prevents a signup near month-end from receiving two separate 5-analysis buckets.

## Billing lifecycle
Only one Stripe subscription remains canonical per StockBox user. Free users may start checkout for any paid tier. Users with a non-terminal paid subscription manage plan changes through Stripe Customer Portal rather than creating a second subscription. Webhooks map every canonical price ID to the correct StockBox plan key.

Pricing UI displays all five tiers, highlights Standard, shows launch-to-regular pricing clearly, and identifies the current paid tier. Elite has no launch offer.

## Giveaways
Giveaways are StockBox promotional access grants, not zero-value Stripe subscriptions. Only admins can create or revoke campaigns. A campaign belongs to one active ambassador, specifies a paid plan, duration in months, quantity, and claim expiry, and generates unique single-use codes.
Ambassadors can view/copy only the campaigns and codes allocated to them; they cannot mint, edit, extend, or revoke access. A winner redeems one code while authenticated. Redemption atomically marks the code used and creates a time-bounded promotional grant.

An active promotional grant never alters or cancels the user's Stripe subscription. Effective access is the higher-ranked entitlement between the active paid subscription and active promotional grant. When the grant expires, access automatically falls back to the underlying paid tier or Free.

Giveaway redemptions create no invoice and no affiliate commission. Free promotional access therefore cannot generate commission or payout liability.

## Security and auditability
Giveaway tables are RLS enabled and deny direct client mutation. Admin creation/revocation and user redemption use security-definer RPCs with role/user checks. Codes are cryptographically random, unique, single-use, and auditable by campaign, ambassador, redeemer, timestamps, and status.

## Release verification
Required gates: focused red-green tests, full Vitest suite, typecheck, ESLint, production build, `git diff --check`, dependency audit, Supabase migration verification, Stripe object verification, exact-commit Vercel READY, and production smoke tests. No real customer charge, transfer, or payout is generated during QA.
