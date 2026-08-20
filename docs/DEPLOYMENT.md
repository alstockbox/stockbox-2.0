# StockBox 2.0 Deployment

Current date: August 20, 2026
Release deadline: August 31, 2026

Target production stack: Vercel for web hosting, Supabase for PostgreSQL/auth, Stripe for billing, and PostHog for product analytics. SEC Companyfacts and Stooq are the initial no-key financial sources; news and AI are disabled, and Resend is the optional email adapter.

## P0 Deployment Principles

- Deploy only from a clean, reviewed release branch.
- Never commit secrets.
- Keep service-role/database/Stripe/AI/provider keys server-only.
- Validate required environment variables at startup.
- Run migrations before exposing traffic.
- Verify Stripe webhooks before relying on paid entitlements.
- Hide unfinished P1/P2 features behind production feature flags.
- Keep rollback simple: previous Vercel production deployment plus reversible database migrations.

## Supabase Setup

1. Create a production Supabase project.
2. Store project URL, anon key, service-role key, and database connection values in the deployment environment.
3. Apply database migrations.
4. Enable RLS on user-owned tables and write explicit policies.
5. Configure Auth site URL and redirect URLs for production and preview domains.
6. Configure email/SMTP settings if Supabase default emails are not acceptable.
7. Create admin seed process or manual admin promotion with audit logging.
8. Verify:
   - signup/login/reset work;
   - user A cannot read user B data;
   - admin-only APIs reject customer accounts;
   - service-role key is not present in browser output.

## Stripe Setup

1. Create products/prices for Free, Basic, Standard, Premium, and Elite.
2. Configure checkout success/cancel URLs.
3. Configure billing portal.
4. Create production webhook endpoint for subscription, invoice, checkout, customer, and payment events.
5. Store a least-privilege restricted server key, price IDs, and webhook signing secret in environment variables.
6. Implement idempotent webhook handling and entitlement sync from Stripe events.
7. Verify in test mode before live mode:
   - checkout starts;
   - subscription activates;
   - credits/limits update;
   - cancellation/downgrade updates access;
   - duplicate webhook delivery does not duplicate credits;
   - failed payment is reflected correctly.

## PostHog Setup

1. Create production PostHog project.
2. Store project key and host in environment variables.
3. Configure feature flags for incomplete P1/P2 features.
4. Instrument P0 funnel events:
   - landing_view
   - signup_started
   - signup_completed
   - onboarding_completed
   - company_searched
   - analysis_started
   - analysis_completed
   - analysis_failed
   - report_viewed
   - explain_clicked
   - company_followed
   - paywall_viewed
   - checkout_started
   - subscription_started
   - subscription_cancelled
   - share_created
   - referral_signup
   - affiliate_conversion
5. Verify no secrets, card data, passwords, or unnecessary personal data are sent.

## Vercel Setup

1. Create/import the Vercel project.
2. Connect the production branch.
3. Add production and preview environment variables.
4. Configure the production domain and DNS.
5. Configure build command, output settings, and scheduled jobs if used.
6. Deploy a preview for every release candidate.
7. Promote only after P0 smoke tests pass.
8. Verify:
   - HTTPS domain loads;
   - env validation passes;
   - server routes can reach Supabase/Stripe/providers;
   - public pages are indexable where intended;
   - private/admin routes require auth;
   - feature flags load.

## Required Environment Groups

- Application: app URL, environment, release version.
- Supabase: URL, anon key, service-role key, database URL.
- Auth: redirect URLs, session settings.
- Stripe: secret key, publishable key, webhook secret, product/price IDs.
- Financial data: provider keys, base URLs, exchange coverage.
- News: provider keys, base URLs, attribution settings.
- AI: provider keys, model names, budget/rate limits.
- Email: API key, sender, admin alert recipients.
- Analytics: PostHog key, host.
- Admin: bootstrap/admin allowlist values.

## Production Smoke Test

1. Open production URL on desktop and mobile.
2. Create a fresh customer account.
3. Complete onboarding in English and Swedish.
4. Search for a real company.
5. Run Summary, Numbers, and Deep analysis.
6. Confirm sources, freshness, confidence, score explanation, and disclaimer.
7. Follow a company and verify watchlist persistence.
8. Hit free limit and see the correct paywall.
9. Complete Stripe test/live penny checkout as approved by owner.
10. Confirm webhook-driven entitlement update.
11. Create share link and open it logged out.
12. Verify referral/affiliate attribution where enabled.
13. Log in as admin and inspect user, analysis, provider, billing, error, and audit records.
14. Cancel/manage subscription through billing portal.
15. Confirm PostHog events and sanitized error logs.

## Rollback

- Vercel: redeploy/promote the previous known-good deployment.
- Supabase: use reversible migrations; never manually mutate production schema without a rollback note.
- Stripe: leave historical products/prices intact; deactivate bad prices instead of deleting relied-on IDs.
- Feature flags: disable problematic P1/P2 features immediately.
- Provider outage: degrade to unavailable states with clear user messaging; do not fabricate data.

## Launch Blockers

- Missing production credentials for any P0 dependency.
- Failed migrations or unverified RLS policies.
- Stripe live mode not approved or webhooks not verified.
- PostHog leaking sensitive data.
- Production app cannot complete signup, analysis, upgrade, share, and admin smoke tests.
- Any P0 feature exposed but incomplete.
