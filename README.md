# StockBox 2.0

StockBox 2.0 is an investment analysis workspace for company research, valuation context, paper investing, thesis tracking, and investor learning.

The current codebase contains the first StockBox 2.0 foundations:

- deterministic stock analysis engine
- sector-aware valuation metric selection
- premium/discount analysis
- historical valuation context
- sector valuation regime
- score explainability
- beginner and deep report layers from the same analysis object
- paper-trading calculation engine
- plan entitlement model
- authenticated private app shell

## Tech

- Next.js App Router with TypeScript
- Tailwind CSS
- Supabase client foundation
- Single-user login with hashed password and HTTP-only cookie
- Vitest for deterministic engine tests
- PWA manifest

## Local Development

1. Run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill in the required environment variables.
4. Run `npm run hash-password` and use the output as `SINGLE_USER_PASSWORD_HASH`.
5. Run `npm run dev` and open `http://localhost:3000`.

## Environment Variables

- `NEXT_PUBLIC_APP_URL`: App URL, usually `http://localhost:3000` locally.
- `NEXT_PUBLIC_SITE_NAME`: Display name, defaults to `StockBox 2.0`.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Secret server key. Never expose this in the browser.
- `SUPABASE_STORAGE_BUCKET`: Optional storage bucket name for future uploaded assets.
- `SINGLE_USER_EMAIL`: The only email address allowed to log in.
- `SINGLE_USER_PASSWORD_HASH`: Hash from `npm run hash-password`.
- `SESSION_SECRET`: Long session secret, at least 32 characters.

## StockBox Domain

The active StockBox domain lives in `src/lib/stockbox`:

- `analysis-engine.ts`: structured company analysis, valuation context, risk, confidence, and report-level output.
- `paper-engine.ts`: deterministic paper-trading calculations.
- `investor-score.ts`: deterministic process-first Investor Score.
- `demo-data.ts`: temporary V2 preview data composed from real domain engines.
- `entitlements.ts`: plan capabilities for Free, Builder, and Pro.
- `types.ts`: shared StockBox domain types.

## App Routes

- `/app/analysis`: current StockBox analysis report.
- `/app/stockbox`: V2 Investor OS dashboard preview.
- `/app/stockbox/thesis`: Quick Thesis / Decision Journal preview.
- `/app/stockbox/portfolio`: Paper portfolio preview.

## Database Roadmap

The first V2 schema foundation is in `supabase/migrations/202609020001_stockbox_v2_foundation.sql`. It adds separate investment-domain tables for profiles, companies, report snapshots, theses, thesis versions, paper portfolios, trades, positions, ledger entries, reviews, score snapshots, DNA observations, watchlist items, and challenges.

## Commands

```bash
npm run hash-password
npm test
npm run typecheck
npm run lint
npm run build
```

## Data Integrity

The analysis engine does not fabricate peers, estimates, historical valuation, or sector data. Missing inputs are reported as insufficient data until a real market/fundamentals provider is connected.
