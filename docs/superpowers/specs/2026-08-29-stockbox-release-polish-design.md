# StockBox Release Polish & Partner System Design

**Date:** 2026-08-29
**Status:** Approved in chat; written spec pending final user review

## Goal

Finish the remaining high-value release work without weakening analysis integrity: maximize legitimate stock coverage, make affiliate operations professional and auditable, simplify navigation/settings, and add clean contact/feedback flows.

## Non-negotiable product rules

- Missing data is preferable to fabricated data.
- Coverage improvements must come from better provider resolution, preserving reported facts, safe derivation, or explicit fallbacks with provenance.
- Common-share classes must not be blocked by stale discovery hints when the backend can legitimately attempt fundamentals.
- ADRs, preferred securities, funds/ETFs, and unsupported specialist securities remain blocked unless explicitly supported.
- Admin-only operations remain server-side and auditable.
- Affiliate users never gain access to customer identities, admin data, other affiliates, or raw payment credentials.
- Passwords are never stored by StockBox outside Supabase Auth.
- Payouts must be ledger-driven, idempotent, reversible for refunds, and reconcilable to Stripe events.

## Delivery order

1. Analysis coverage hardening
2. Ambassador creation and admin preview
3. Affiliate commission ledger and automated payouts
4. Affiliate dashboard redesign
5. Navigation and settings consolidation
6. Contact and feedback
7. Full RBAC, security, regression, and production smoke gate
