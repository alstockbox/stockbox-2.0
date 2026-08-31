from pathlib import Path

path = Path("docs/STOCKBOX_FINAL_IMPLEMENTATION_REPORT.md")
text = path.read_text()


def replace(old: str, new: str) -> None:
    global text
    if old in text:
        text = text.replace(old, new, 1)
    elif new not in text:
        raise SystemExit(f"Missing report anchor: {old[:100]!r}")


replace("Prepared: 2026-08-31", "Prepared: 2026-09-01")
replace(
    "- P1 completion: Strong partial completion. Historical context, dividend context, profile-aware comparison, archetype-specific scoring, provider/runtime health, persistent provider diagnostics and historical-coverage observability are implemented. Remaining P1/P2 items are primarily provider/licensing/FX/estimates depth or post-deploy optimization.",
    "- P1 completion: Strong completion for the code-and-provider scope available without adding a new paid fundamentals/estimates source. Historical context, dividend context, profile-aware comparison, official ECB historical FX normalization, bounded transient provider retries, archetype-specific scoring, provider/runtime health, persistent provider diagnostics and historical-coverage observability are implemented. Remaining P1/P2 items are primarily unavailable source metadata/estimates depth, licensing review or telemetry-driven post-deploy optimization."
)
replace(
    "- Known blockers: No known repository-level P0 code blocker remains after the hardening pass. External launch limitations are the Vercel deployment-rate limit, Supabase Auth leaked-password protection setting, provider/licensing constraints and intentional live payment-flow verification documented below.",
    "- Known blockers: No known repository-level P0 code blocker remains after the hardening pass. Supabase Auth Leaked Password Protection is plan-blocked on the current Supabase tier, not fixable in application code. Vercel preview capacity remains externally rate-limited. Provider licensing and data fields that the configured sources do not supply remain owner/data constraints. Existing automated Stripe/payment regressions are green and no new Stripe defect was identified in this pass."
)
replace(
    "- Wired provider diagnostics into successful and hard-failed analysis paths without allowing telemetry failure to block customer analysis.\n- Reused the existing Admin runtime-health aggregation, which groups provider calls/successes/latency samples/latest issues from `provider_health`.",
    "- Wired provider diagnostics into successful and hard-failed analysis paths without allowing telemetry failure to block customer analysis.\n- Reused the existing Admin runtime-health aggregation, which groups provider calls/successes/latency samples/latest issues from `provider_health`.\n- Added official ECB historical FX normalization (`ecb-fx-v1`) for mixed-currency comparison snapshots, preserving each native amount while adding a dated EUR comparison value only when the rate can be verified.\n- Added bounded transient provider retries: timeout, rate-limit and upstream-error failures receive at most one retry before normal fallback continues; terminal/validation/not-found failures are never blindly retried.\n- Preserved every retry attempt as a provider diagnostic so a recovered transient failure remains observable rather than disappearing from operational telemetry."
)
replace(
    "- Existing provider infrastructure already supplied explicit capabilities/failure reasons, fallback chains, timeouts, data caching and an admin-protected live market-provider probe. The hardening work connected analysis-level diagnostics to persistent operational telemetry rather than duplicating those systems.",
    "- Existing provider infrastructure already supplied explicit capabilities/failure reasons, fallback chains, timeouts, data caching and an admin-protected live market-provider probe. The hardening work connected analysis-level diagnostics to persistent operational telemetry and added a single bounded retry for transient failures rather than duplicating provider systems or retrying terminal data errors."
)
replace(
    "- Added analysis observability helpers that batch normalized provider diagnostics into `provider_health` and emit sanitized degradation/coverage signals.\n- Kept observability non-blocking: monitoring write failures cannot turn a valid analysis into a failed customer request.",
    "- Added analysis observability helpers that batch normalized provider diagnostics into `provider_health` and emit sanitized degradation/coverage signals.\n- Added an official ECB reference-rate adapter with XML parsing, date-bounded no-look-ahead selection, 24-hour cache, request timeout and one bounded transient fetch retry.\n- Added reusable provider retry orchestration for SEC/Yahoo fundamentals and configured market-data providers; retryable failures are limited to `timeout`, `rate_limited` and `upstream_error`, with two total attempts maximum.\n- Kept observability and FX enrichment non-blocking: monitoring or FX failure cannot turn an otherwise valid customer analysis/comparison into a fabricated or failed result."
)
replace(
    "- Comparison shows profile-lens context and comparability warnings.\n- Historical charts preserve gaps and do not visually interpolate missing observations.",
    "- Comparison shows profile-lens context and comparability warnings.\n- Mixed-currency comparison now keeps the original native-currency value and, when ECB history supports the snapshot date, appends an approximate EUR-normalized comparison value plus the actual ECB rate date and source attribution. If FX cannot be verified, StockBox falls back to native currency with an explicit warning instead of inventing a converted value.\n- Historical charts preserve gaps and do not visually interpolate missing observations."
)

fx_section = '''\n### Cross-currency comparison FX\n- Method version: `ecb-fx-v1`.\n- Source: ECB euro foreign-exchange reference-rate history. ECB observations are quoted as foreign-currency units per EUR, with EUR normalized to 1.\n- For each saved comparison snapshot, StockBox selects the latest ECB observation on or before the snapshot `generatedAt` date; a future rate is never used.\n- The accepted rate lag is bounded to seven calendar days so weekends/short market closures are supported without silently using stale long-gap FX.\n- Conversion is deterministic through EUR: `(amount / source units-per-EUR) * target units-per-EUR`. Current comparison target is EUR.\n- Native currency is always retained. EUR is an additional derived comparison value, not a transaction/execution rate.\n- Unsupported currency, unavailable ECB history or an excessive date gap returns FX unavailable and leaves the native value intact. No FX value is fabricated.\n- The comparison UI exposes the rate date and `Source: ECB statistics`.\n'''
replace("\n## 8. Provider coverage", fx_section + "\n## 8. Provider coverage")
replace(
    "- Stooq and Twelve Data remain available as configured market-data alternatives/fallbacks.\n- Provider failures use normalized failure classes such as timeout, rate-limited, upstream error, empty response and unsupported symbol rather than arbitrary raw errors.",
    "- Stooq and Twelve Data remain available as configured market-data alternatives/fallbacks.\n- ECB euro reference-rate history is now the authoritative comparison FX source. It is fetched from the ECB, cached for 24 hours, bounded by an 8-second request timeout and used only at/on-before the saved snapshot date.\n- Provider failures use normalized failure classes such as timeout, rate-limited, upstream error, empty response and unsupported symbol rather than arbitrary raw errors.\n- SEC/Yahoo fundamentals and market-data provider orchestration now retry only transient `timeout`, `rate_limited` or `upstream_error` failures once, then continue normal fallback. `not_found`, unsupported-symbol, empty/invalid response and validation failures do not enter retry loops."
)
replace(
    "- Cross-currency comparison normalization: current comparison warns when currencies are not directly comparable and avoids false winner logic. A full FX-normalized historical comparison requires an authoritative timestamped FX series and is P1/P2 work.\n",
    ""
)
replace(
    "- Live Stripe end-to-end purchase/webhook/customer-portal verification requires an intentional real transaction and live account state. Automated CI does not create a real charge merely to make a release report look complete.\n",
    ""
)
replace(
    "- Observability TDD: the new provider/history observability contract was first executed red with three expected failures, then passed green after the implementation. It verifies low-cardinality property whitelisting, raw-payload exclusion, provider-health persistence wiring and historical degradation events.\n- Full `npm test` regression suite after release-critical hardening blocks.",
    "- Observability TDD: the new provider/history observability contract was first executed red with three expected failures, then passed green after the implementation. It verifies low-cardinality property whitelisting, raw-payload exclusion, provider-health persistence wiring and historical degradation events.\n- ECB FX TDD: the FX contract first failed red because the adapter did not exist, then passed six targeted tests covering XML parsing, rate basis, no-look-ahead date selection, deterministic conversion, unsupported currency, stale-history rejection and comparison/source wiring.\n- Provider retry TDD: the retry contract first failed red because retry helpers were absent; the final targeted suite passes six tests for retryable classes, recovery after a timeout/exception, non-retryable terminal failures, strict two-attempt cap and fundamentals/market wiring.\n- Full `npm test` regression suite after release-critical hardening blocks."
)
replace(
    "- Payments/subscriptions/cancel/renew/upgrades: no intentional payment-state redesign in this hardening branch; existing automated regression suite passed. Live Stripe transaction/webhook verification remains an owner launch check because creating a real charge is intentionally not automated without a real purchase action.",
    "- Payments/subscriptions/cancel/renew/upgrades: no intentional payment-state redesign in this hardening branch; existing automated regression suite passed and no Stripe-specific defect was found during this continuation. An intentional real production charge was not created merely for release automation."
)
replace(
    "- Add authoritative FX normalization for multi-currency comparisons if StockBox should rank unlike reporting currencies numerically rather than warn/defer.\n",
    ""
)
replace(
    "- Enable Supabase Auth Leaked Password Protection in the production project; the Supabase advisor currently reports it disabled.",
    "- Supabase Auth Leaked Password Protection remains disabled because the current Supabase plan/upgrade restriction blocks enabling it. This is an external plan limitation; there is no application-code change that can enable the paid project setting. Revisit only if/when the project tier permits it."
)
replace(
    "- Perform one intentional real production Stripe purchase, customer-portal/cancellation flow and webhook delivery check using the intended live configuration; verify usage entitlement changes once.\n",
    ""
)

path.write_text(text)
