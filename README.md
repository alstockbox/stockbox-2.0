# StockBox 2.0

StockBox is a Next.js equity-research SaaS that turns real SEC filings and end-of-day market observations into deterministic metrics, scores, flags, scenarios, and source-visible reports.

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and add only the providers you are testing.
3. For live US-company analysis, set `SEC_USER_AGENT` to a compliant contact string such as `StockBox contact@example.com`.
4. Market data defaults to Stooq. To use the optional global adapter, configure `TWELVE_DATA_API_KEY`, set `MARKET_DATA_PROVIDER=twelve_data`, and list only explicitly configured fallbacks in `MARKET_DATA_FALLBACK_PROVIDERS`.
5. Run `npm run dev` and open `http://localhost:3000`.

Without Supabase, auth and persistence show setup-required states. Without `SEC_USER_AGENT`, the product can be explored but live analysis is disabled. No fake production fallback is used.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

See `docs/OWNER_ACTIONS.md` for external launch requirements and `docs/ANALYSIS_METHODOLOGY.md` for model details.
