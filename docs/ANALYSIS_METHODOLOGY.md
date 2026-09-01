# StockBox Analysis Methodology

Model version: `stockbox-analysis-engine-v2.7.0`
Report schema: `stockbox-analysis-report-v5`
Score policy: `stockbox-score-policy-v9`
DCF policy: `stockbox-dcf-assumptions-v4`
Static benchmarks: `stockbox-static-benchmarks-v1`

## Canonical identity and providers

The analysis API resolves the requested listing and issuer on the server. Browser-supplied CIK, entity ID, canonical ticker, country, currency and provider metadata are not authoritative. A CIK, issuer or listing mismatch, an ambiguous result, or an unsupported security class stops analysis before provider access. Duplicate provider representations of the same bare U.S. ticker may merge only when both are clearly U.S. listings and no stable security identifier or CIK conflicts. ADRs, preferred securities, ETFs, funds, and unsupported composite/unit securities remain discovery-only for common-stock fundamentals. Global listing-class inference explicitly distinguishes supported common shares from preferred classes and known exchange-specific unit/certificate structures, including Brazilian preferred classes, Mexican composite units/certificates, the tested German/Xetra class-3 preference-share convention, and explicitly catalogued non-common participation certificates such as Roche ROP.

For CIK-backed common stocks, SEC Companyfacts and Yahoo fundamentals may be requested together. SEC reported facts retain priority for the same metric and period. A secondary provider may fill a missing metric only after issuer, period, currency and metric compatibility checks. Material disagreements are recorded as source conflicts and high-severity conflicts block scoring and the current research-view conclusion. Provider diagnostics preserve attempts, selected capabilities, fallback use and failures.

## Data and calculations

The live adapter reads SEC XBRL facts, Yahoo Finance reported global fundamentals, and the configured market-data provider chain. It derives growth, CAGR, margins, free cash flow, cash conversion, leverage, coverage, valuation yields and momentum only when required numerators and denominators exist. Missing debt, cash, interest, market value or current shares remain unavailable; they are never replaced by zero or diluted weighted-average shares.

Free cash flow is operating cash flow less capital expenditure. SEC capex is commonly represented as a negative cash outflow, so the adapter normalizes sign before use. Yahoo balance reconciliation preserves parent/shareholder equity for return metrics and, when a same-period minority-interest fact is absent, may derive minority interest only from reported gross equity including minority interest minus reported parent equity, with explicit derived provenance. CAGR is `(end/start)^(1/years) - 1`, requires positive endpoints, and uses the actual comparable fiscal-year or period-end span. Non-contiguous histories do not receive false three- or five-year growth or stability. Dividend CAGR compares annual periods only; TTM dividends are not mixed with fiscal-year endpoints.

Reporting currency and trading currency are separate fields. Currency alignment is `aligned`, `mismatch` or `unknown`; unknown is never treated as aligned. Financial periods obtain currency from facts for that period. Mixed period currencies or conflicting monetary fact currencies block cross-period scoring. Cross-currency and unknown-currency valuation remain unavailable because StockBox has no verified FX layer.

Current market capitalization is reconciled against economic quote price times current shares when both bases are current and currency-compatible. A material share-basis disagreement above 5% blocks all market-based valuation metrics, including P/E, P/S, EV multiples, earnings yield and FCF yield, as well as DCF. A stale reported market cap may be replaced by a fresh derived `price × shares` value only when the quote and current-share inputs themselves pass freshness, currency and security-basis gates.

Freshness thresholds are centralized in `src/lib/analysis/freshness.ts`: reported TTM/interim financial flows and balance sheets 220 days, annual financial flows and balance sheets 455 days, market price and market cap 10 days, and current shares outstanding 180 days. Historical period snapshots apply a stricter temporal-alignment rule: a reported share-count fact must be within 95 days of that period end, otherwise the historical share count remains unavailable. If a TTM/interim period is stale because either its flow date or supporting balance-sheet date breaches the interim window, the engine may fall back to the latest annual statements only when that annual period remains current under the separate annual thresholds. Future-dated statements, stale fundamentals without a valid annual fallback, and stale valuation inputs fail closed. Freshness diagnostics report temporal freshness only; independent currency- or provider-integrity blockers remain separate reconciliation findings. Market cap carries its own as-of date and currency.

## Score dimensions

The canonical engine scores Growth, Profitability, Financial Health, Valuation, Cash Flow, Earnings Quality, Quality, Momentum, and Risk. Weights sum to 100% after normalization. Static benchmarks are versioned but are not yet empirically calibrated; that work belongs to later official batches.

Unavailable contributors do not become zero-valued facts. Planned coverage is retained, dimension coverage must reach 0.50, and overall weighted coverage must reach 0.55. Investment profiles apply a separate normalized weight set to the same canonical facts.

## Archetypes and special companies

Classification records its reason, source, confidence, ambiguity and candidates. The supported archetypes are standard, software growth, bank, insurer, REIT, utility, cyclical, pre-revenue biotech, holding company and unknown. Passenger-vehicle manufacturers are classified as consumer/cyclical, while heavy machinery and industrial transport-equipment manufacturers remain industrial/cyclical. Airlines, marine/ocean shipping and railroads use cyclical methodology; freight/logistics services remain standard. Interactive gaming/multimedia is separated from generic electronic-equipment technology wording. Broad non-REIT real-estate, asset-management and capital-markets evidence remains `unknown` until specialized methodology exists; these companies must not fall through to generic corporate FCFF. Unknown companies receive no canonical score or current research-view conclusion.

Banks use separate profitability, capital adequacy, asset quality, funding and equity-valuation inputs. Insurers use underwriting, book value, return, capital and reserve inputs. REITs use trustworthy provider-reported or fully supported derived FFO, company-defined AFFO, property metrics, REIT leverage and FFO valuation. GAAP net income is not relabelled FFO, and generic free cash flow is not relabelled AFFO. Missing specialist coverage produces an insufficient-data research view.

Corporate FCFF is inappropriate for banks, insurers and REITs. Cyclical DCF requires at least four contiguous comparable annual periods and uses a multi-period normalized FCFF margin scaled to current annual revenue. Insufficient cycle history makes DCF unavailable.

## Overall research view

The customer-facing conclusion is neutral research classification rather than BUY/HOLD/SELL advice. StockBox maps the personalized score when available, otherwise the canonical score, into these presentation bands:

- Strong: score at least 75.
- Solid: score at least 60 and below 75.
- Mixed: score at least 42 and below 60.
- Weak: score below 42.
- Insufficient data: no finite score, confidence below 40, or weighted data coverage below 0.55.

The research view does not override missing-data, freshness, currency, archetype, specialist-coverage or source-conflict gates. Confidence measures trust in the method and underlying data, not whether a company is attractive.

A legacy directional-rating field remains in the persisted report schema for historical compatibility, regression and calibration. It is not the primary customer conclusion and must not be interpreted as another version of the Research View. A Strong or Solid Research View can therefore coexist with a legacy Hold when current valuation support, valuation coverage, confidence or unresolved risk gates do not justify a directional Buy/Sell rating. When this combination is surfaced, the report explains that distinction and, where available, shows the applied rating constraint. Customer-facing alerts and analytics use the neutral overall Research View instead.

Confidence measures method and data trust, not company quality. It incorporates coverage, financial and market freshness, source quality, reconciliation, valuation inputs and assumptions, entity confidence, currency state, archetype confidence, specialist coverage and source conflicts. Overall confidence is capped at 35 when the archetype is unresolved, at 45 when a bank/insurer/REIT has less than 30% specialist coverage, and at 60 while specialist coverage remains below 70%. A failed provider attempt does not lower core source quality when a complete fallback succeeds; fallback use remains visible in QA.

## DCF

The engine uses a deterministic five-year FCFF-style model, fades observed growth, discounts explicit cash flows and terminal value, subtracts net debt, and divides by current shares outstanding. Bear/Base/Bull cases change growth, discount and terminal assumptions. It refuses output without positive FCFF, current shares, net debt, valid finite rates, aligned currencies and fresh market inputs.

Every DCF assumption records value, source, as-of date, value kind and assumption-policy version. Versioned StockBox policy assumptions are distinguished from emergency fallbacks. Multiple company-specific fallback assumptions reduce assumption quality and make output illustrative rather than directional. Terminal value above 75% of enterprise value reduces confidence. Invalid or non-finite assumptions cannot produce NaN or Infinity.

The live report displays the engine's per-share Bear/Base/Bull range only when deterministic cash-flow, net-debt, market-value and share inputs exist. Otherwise DCF remains unavailable or inappropriate with the missing inputs shown.

## Reproducibility and QA

The result stores model, score-policy and benchmark versions plus a SHA-256 fingerprint of the sorted canonical input and those versions. `analysisDate` is injectable for deterministic reruns. Sources distinguish `dataAsOf` from `accessedAt` and include provider capability and adapter version. Research is attached once after the canonical result and source list exist, and signal evidence is capability- or metric-provenance-specific.

Batch QA persists score, coverage, confidence, versions and fingerprint. Rerun comparison reports added/removed/matched entities, signed and absolute score changes, score availability, research-view transitions, coverage, confidence, archetype and flag changes. The legacy directional field remains available for historical regression compatibility. This does not imply benchmark calibration has already been completed.

## Limitations

SEC tags vary by issuer and history can be incomplete. Market fallbacks may be end-of-day rather than real-time. Reliable specialist data for banks, insurers and REITs is not universally available. The provider stack does not supply licensed transcripts, live peer sets, analyst ratings, ownership, insider, news, macro, geopolitical or positioning research for every market; those layers remain explicitly unavailable. Scores are research aids based on historical relationships, not forecasts, guarantees or individualized advice.
