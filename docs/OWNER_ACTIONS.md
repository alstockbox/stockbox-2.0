# StockBox 2.0 Owner Actions

Required before public launch:

1. Create the production Supabase project, apply all migrations through `supabase/migrations/20260821020000_p0_billing_state.sql`, verify the approved billing state, configure Auth URLs/email, and add the three Supabase environment values.
2. Reauthenticate the Stripe integration, create the Basic recurring price at 79 SEK/month and a repeating three-month coupon that reduces it to 49 SEK/month, add their IDs, and register `/api/stripe/webhook` with its signing secret. Use a restricted server key with only required permissions. Do not configure Standard, Premium, or Elite prices until they are commercially approved.
3. Set `SEC_USER_AGENT` to a compliant product-and-contact string and approve initial US/eod-only data coverage. Obtain licensed global, estimates, news, and transcript sources before enabling those features.
4. Create the Vercel project, add environment values, connect the production domain/DNS, and approve live deployment.
5. Supply the legal entity name, address, support/privacy contact, governing law, retention/deletion policy, and approved Terms/Privacy/financial disclaimer copy.
6. Add `ADMIN_EMAILS`; optionally configure PostHog and Resend plus `ADMIN_ALERT_EMAIL` and `FROM_EMAIL`.
7. Verify the approved commercial state: Free is active; Basic is active at 79 SEK/month with a 49 SEK/month launch offer for the first three months; Standard, Premium, and Elite remain unpriced and inactive.

Current external blocker: no credentials or production authorization are present in the workspace. Stripe tooling also returned an authentication error and must be reconnected by the owner.
