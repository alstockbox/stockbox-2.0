# Ambassador Custom Entitlements Design

## Goal

Make Affiliate Ambassador access individually configurable from `/admin` instead of relying on one hard-coded package for every ambassador.

The admin must be able to grant or revoke Ambassador status and independently set limits for analyses, Deep/Research analyses, batch rows, watchlist items, portfolios, and commission basis points.

The test account for rollout validation is `arthurfl.contact@gmail.com`.

## Current state

Today Ambassador access is split across several hard-coded paths:

- analysis quota: 100 monthly analyses and 100 Deep/Research
- batch: 50 rows
- watchlist: 75 items
- portfolios: 5
- affiliate commission: stored on `affiliates.commission_basis_points`
- role activation: `profiles.role = 'affiliate_ambassador'`

This creates configuration drift risk because changing one number does not automatically change the others.

## Design principle

There will be one authoritative per-user entitlement record for Ambassador limits. All Ambassador quota decisions must read from that record.

Admin accounts remain exempt from subscription and Ambassador limits. Paid customer plan behavior remains unchanged.

## Data model

Create `public.ambassador_entitlements` with exactly one row per Ambassador-capable user:

- `user_id uuid primary key references public.profiles(id) on delete cascade`
- `monthly_analyses integer not null`
- `deep_analyses integer not null`
- `batch_rows integer not null`
- `watchlist_items integer not null`
- `portfolios integer not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Validation constraints:

- analyses and Deep/Research: `0..100000`
- batch rows: `0..50`
- watchlist items: `0..100000`
- portfolios: `0..10000`
- `deep_analyses <= monthly_analyses`

The affiliate commission rate stays on `public.affiliates.commission_basis_points`; it is already the canonical commission field and must not be duplicated.

RLS is enabled on `ambassador_entitlements`. No anon/authenticated policies are added. Direct access is service-role/admin-only.

Existing Ambassadors are backfilled with the current package `100 / 100 / 50 / 75 / 5` so rollout does not silently change anyone's access.

## Admin mutation contract

Replace the role-only mutation with one admin-only RPC/action that can manage both role and settings atomically.

Inputs:

- target user id
- enabled boolean
- monthly analyses
- Deep/Research analyses
- batch rows
- watchlist items
- portfolios
- commission basis points

When enabling an Ambassador:

1. reject admin/protected accounts
2. set `profiles.role = 'affiliate_ambassador'`
3. upsert the entitlement row
4. create or reactivate the affiliate row and referral code
5. update `commission_basis_points`
6. write one audit-log event containing old/new role and old/new limits

When disabling an Ambassador:

- set role back to `customer`
- set affiliate status to `inactive`
- keep the entitlement row and historical affiliate record for future reactivation
- write an audit-log event

Self-role changes and conversion of admin accounts remain forbidden.

## Entitlement resolution

The quota resolver must follow this precedence:

1. `admin` -> unlimited analysis access and existing admin workspace behavior
2. `affiliate_ambassador` -> read `ambassador_entitlements`
3. paid customer -> read active Stripe plan
4. otherwise -> Free plan

`reserve_analysis_entitlement()` must use the Ambassador row for both total monthly analyses and Deep/Research analyses.

`private.workspace_entitlements()` must use the same row for batch rows, watchlist items, and portfolios.

`getBatchEntitlement()` must stop returning a hard-coded 50 for ambassadors and resolve the configured batch limit.

If an Ambassador role exists but its entitlement row is unexpectedly missing, the system must fail safe by falling back to the historical `100 / 100 / 50 / 75 / 5` package and emit an admin-visible diagnostic rather than treating the user as Free.

## Admin UI

The `Affiliate ambassadors` section on `/admin` becomes an editable management surface.

For each profile, admin can:

- enable or disable Ambassador status
- edit monthly analyses
- edit Deep/Research analyses
- edit batch rows
- edit watchlist items
- edit portfolios
- edit commission percentage
- see referral code and current affiliate status when available

Values are saved server-side through validated actions. The browser never receives service-role credentials.

## Validation and safety

Server-side validation is mandatory even when the UI uses numeric inputs.

- all limits are integers
- negative values are rejected
- Deep/Research may not exceed monthly analyses
- batch rows may not exceed 50
- commission is stored as basis points and constrained to `0..10000`
- protected admin accounts cannot be modified
- only `requireAdmin()` callers may invoke the management action
- underlying SQL RPCs remain inaccessible to anon/authenticated roles

All changes must be auditable and must not delete prior affiliate clicks, attributions, or historical records.

## Initial production test configuration

For `arthurfl.contact@gmail.com`, after deployment and migration, set:

- Ambassador: active
- monthly analyses: 150
- Deep/Research analyses: 150
- batch rows: 50
- watchlist items: 75
- portfolios: 5
- commission: 0 basis points

The account already exists as a `customer`, so no account creation is required.

## Verification requirements

Before production rollout, tests must prove:

- custom 20-analysis and 150-analysis ambassadors enforce different limits
- Deep/Research has its own configured limit
- batch uses configured `batch_rows`
- watchlist/portfolio RPCs use configured workspace values
- admin remains unlimited
- removing Ambassador status disables affiliate referral but preserves stored limits
- reactivation restores stored limits unless admin changes them
- commission changes persist without changing referral ownership
- protected/admin accounts cannot be modified

## UI defaults and diagnostics

When enabling a customer who has no stored Ambassador settings, `/admin` pre-fills the historical package `100 / 100 / 50 / 75 / 5` and `0%` commission. Admin may change every value before saving.

Commission is entered as a percentage in the UI but converted server-side to integer basis points (`1% = 100 bp`). Only values exactly representable to two decimal places are accepted.

Entitlement resolution should return a source marker such as `ambassador_custom` or `ambassador_fallback`. If an Ambassador is served from the fallback because the entitlement row is missing, the application records a sanitized admin-visible diagnostic. The quota decision still uses the historical package so the user is not accidentally downgraded to Free.

The admin page should display the saved values after every mutation, so the operator can verify that the backend record—not only the form state—changed successfully.
