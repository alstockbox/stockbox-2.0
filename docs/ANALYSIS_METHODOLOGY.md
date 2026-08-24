# StockBox Analysis Methodology

Model version: `stockbox-analysis-engine-v0.1.0`

## Data and calculations

The live adapter reads SEC XBRL annual facts and the configured market-data provider chain, with Twelve Data intended for production market data and Stooq retained as an explicit end-of-day fallback. It derives growth, CAGR, margins, free cash flow, cash conversion, leverage, coverage, earnings/FCF yield, and momentum only when required numerators and denominators exist. Missing or unsafe denominators produce `null`, never zero or an invented estimate.

Free cash flow is operating cash flow less capital expenditure. SEC capex is commonly represented as a negative cash outflow, so the adapter normalizes sign before use. CAGR is `(end/start)^(1/years) - 1` and requires positive endpoints.

## Score dimensions

The full engine scores Growth, Profitability, Financial Health, Valuation, Cash Flow, Earnings Quality, Quality, Momentum, and Risk. General weights sum to 100% after normalization. Technology, financial, and utility adapters adjust benchmarks and weights; unsupported sectors use conservative general benchmarks.

Unavailable contributors are excluded from the weighted numerator and denominator. Coverage reduces confidence. Investment profiles apply a separate normalized weight set to the same dimension values, producing a personalized score without changing facts.

## Recommendation gates

- Strong Buy: personalized/general score at least 84, confidence at least 72, no critical or high red flags.
- Buy: score at least 68, confidence at least 55, no critical red flag.
- Strong Sell: score at most 24, confidence at least 70, plus a critical flag or at least two high flags.
- Sell: score at most 40 and confidence at least 55.
- Otherwise: Hold.

Confidence below 40 caps the full-engine assessment at Hold. Critical unresolved flags prevent Buy classifications. The compact live-report adapter uses nearly identical conservative gates (82/72 for Strong Buy and 68/58 for Buy) while provider mapping into the richer engine is completed.

## DCF

The full engine uses a deterministic five-year FCFF-style model by default, fades observed growth, discounts explicit cash flows and terminal value, subtracts net debt, and divides by shares. Bear/Base/Bull cases change growth, discount, and terminal assumptions. It refuses output without positive FCF and shares outstanding, and marks standard FCFF DCF inappropriate for financial companies.

The current live report displays an enterprise-value proxy range when positive FCF exists because the free SEC adapter does not reliably supply normalized shares for every issuer. It is labeled as a range and is not presented as a target price.

## Limitations

SEC tags vary by issuer and history can be incomplete. Stooq fallback data is end-of-day, not real-time. The initial provider stack does not supply licensed estimates, transcripts, peer sets, analyst ratings, or company-specific qualitative evidence; StockBox does not invent those sections. Scores are research aids based on historical relationships, not forecasts, guarantees, or individualized advice.
