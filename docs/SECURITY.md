# StockBox 2.0 Security And Financial Safety

Current date: August 27, 2026
Release deadline: August 31, 2026

## Security Posture

StockBox handles user accounts, paid subscriptions, usage credits, financial research data, and internal admin operations. The repository now includes least-privilege service boundaries, ownership checks, RLS, signed webhooks, validation, sanitized errors, fail-closed feature flags, a Supabase-backed distributed rate limiter with process-local fallback, and baseline CSP/HSTS headers. Public release remains blocked until migrations are applied and tested in production, edge/WAF rate limiting and CSP browser QA are validated, and the final security review passes.

## P0 Security Controls

| Control | Requirement |
| --- | --- |
| Authentication | Production auth with email verification, secure password reset, secure session cookies, and brute-force protection. |
| Authorization | Server-side RBAC for customer/admin separation. Never rely on frontend admin checks. |
| Database access | Supabase RLS or equivalent policies for user-owned records; service-role key server-only. |
| Secrets | No secrets in git, browser bundles, logs, screenshots, or analytics events. Rotate on exposure. |
| Stripe | Verify webhook signatures, use idempotency keys, store subscription state from webhooks, never trust client-only checkout results. |
| Input validation | Validate all API inputs, route params, tickers, provider responses, webhook payloads, and admin mutations. |
| Injection protection | Use parameterized database APIs; sanitize rendered provider/AI text; encode output. |
| IDOR protection | Every user-scoped read/write must check ownership server-side. |
| Rate limiting | Sensitive/expensive application routes use an atomic Supabase-backed limiter with hashed keys and process-local fallback. Validate Vercel edge/WAF limits in production as additional defense in depth. |
| SSRF protection | Server fetchers must use allowlisted provider hosts and block arbitrary internal/private URLs. |
| Headers | Enable HTTPS-only cookies, HSTS, frame protections, MIME sniffing protection, referrer policy, and CSP where practical. |
| Logging | Log sanitized context only; never log passwords, tokens, card data, service keys, or unnecessary personal data. |
| Admin audit | Record sensitive admin actions: plan changes, credit grants, model threshold changes, user access, feature flags, promotions. |
| Dependency hygiene | Run dependency audit and remove unused packages before launch. |

## Financial Safety Posture

- StockBox is an analytical research tool, not an investment adviser.
- Scores and model classifications are StockBox model assessments based on available data, assumptions, and historical relationships.
- Historical results and model outputs do not guarantee future performance.
- Users remain responsible for investment decisions.
- Reports must show sources, data freshness, confidence, missing-data warnings, and methodology links.
- Deterministic code must perform arithmetic, ratios, DCF math, score normalization, and entitlement accounting.
- AI may synthesize and explain, but must not invent metrics, sources, financial statements, or unsupported claims.
- Production must never silently fall back to fake financial data.
- Strong Buy/Strong Sell labels require stricter gates than score thresholds alone, including confidence and red-flag checks.

## Privacy Baseline

- Collect only data required for accounts, billing, product usage, personalization, analytics, abuse prevention, and support.
- Prepare EU-ready foundations: privacy policy, cookie handling, data export, account deletion, retention policy, consent records where needed, and email preferences.
- Do not send sensitive financial/account data to PostHog or AI providers unless explicitly required, minimized, and documented.

## P1 Hardening

- Extend the existing automated security suite with runtime production/isolated-Postgres RLS probes, WAF abuse tests and browser CSP validation.
- CSP violation reporting.
- Admin approval workflow for model threshold changes.
- Provider-specific data retention rules.
- Session/device management.

## P2 Hardening

- Formal threat model and abuse model.
- Third-party penetration test.
- Secret scanning in CI.
- Advanced anomaly detection for referral/affiliate abuse.
- Automated dependency update policy.

## Launch Blockers

- Any exposed service-role key, Stripe secret, AI key, financial provider key, or webhook signing secret.
- Any admin API that can be called by a customer account.
- Any user-owned data accessible by another user through direct IDs.
- Stripe checkout without verified webhook entitlement sync.
- Reports generated from fake, stale-without-warning, or unsourced production data.
- Critical/high dependency vulnerability without mitigation.
- Missing financial disclaimer or methodology link on analysis outputs.
