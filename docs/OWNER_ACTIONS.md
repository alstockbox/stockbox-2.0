# StockBox 2.0 Owner Actions

Required before public launch:

1. Create the production Supabase project, apply `supabase/migrations/20260820220000_initial_stockbox.sql`, configure Auth URLs/email, and add the three Supabase environment values.
2. Reauthenticate the Stripe integration, confirm plan prices and VAT/refund/trial rules, create four recurring prices, add their IDs, and register `/api/stripe/webhook` with its signing secret. Use a restricted server key with only required permissions.
3. Set `SEC_USER_AGENT` to a compliant product-and-contact string and approve initial US/eod-only data coverage. Obtain licensed global, estimates, news, and transcript sources before enabling those features.
4. Create the Vercel project, add environment values, connect the production domain/DNS, and approve live deployment.
5. Supply the legal entity name, address, support/privacy contact, governing law, retention/deletion policy, and approved Terms/Privacy/financial disclaimer copy.
6. Add `ADMIN_EMAILS`; optionally configure PostHog and Resend plus `ADMIN_ALERT_EMAIL` and `FROM_EMAIL`.
7. Approve or change proposed monthly prices: Free 0, Basic 79, Standard 149, Premium 299, Elite 599 SEK.

Current external blocker: no credentials or production authorization are present in the workspace. Stripe tooling also returned an authentication error and must be reconnected by the owner.
