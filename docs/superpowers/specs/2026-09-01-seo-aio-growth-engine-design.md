# StockBox SEO/AIO Growth Engine Design

## Goal

Turn StockBox from a mostly application-oriented site into a crawlable, trustworthy investor-research knowledge surface that can rank for Swedish stock-analysis intent and provide citeable public facts to search and AI systems without exposing private analyses or generating thin programmatic spam.

## Principles

1. Public SEO content must be derived from real StockBox analysis output or carefully authored evergreen educational copy.
2. Private user analyses must never become public automatically.
3. Programmatic stock pages are indexable only when a deliberately published snapshot passes data-quality gates.
4. Public pages must preserve provenance, data date, model version, coverage/confidence and financial-disclaimer context.
5. The implementation must not trigger a new provider analysis on crawler page views; public pages read stored snapshots only.
6. No fake review/rating structured data and no unsupported financial claims.
7. Swedish commercial search intent is the first SEO market; existing English application UX remains intact.

## Architecture

### 1. Evergreen SEO landing pages

Create server-rendered Swedish pages for high-intent queries:

- `/aktieanalys`
- `/ai-aktieanalys`
- `/fundamental-analys`
- `/nyckeltal/pe-tal`
- `/aktier`

These pages explain the topic with original StockBox methodology context, link to methodology/data-source pages, link to relevant public stock pages, and drive the visitor to the analysis workflow.

### 2. Public stock snapshot store

Add `public_stock_snapshots` in Supabase. A row stores a sanitized AnalysisReport snapshot plus SEO publication metadata. It is separate from `analyses` so publication is explicit and privacy boundaries are clear.

Required fields include slug, ticker, company name, source analysis id, sanitized report JSON, score, confidence, data coverage, data-as-of date, publish/update timestamps, indexability state and optional meta description.

### 3. Explicit admin publication

Add an admin-only API route that publishes an existing analysis into `public_stock_snapshots`. Publication is rejected unless:

- the analysis uses the balanced investment profile;
- StockBox score exists;
- confidence is at least 65%;
- data coverage is at least 70%;
- the report is not stale/unavailable;
- company identity and ticker exist.

The publisher removes admin-only QA data before storing the public snapshot. This endpoint is the only first-version path that makes an analysis public.

### 4. Programmatic stock pages

Create `/aktier/[slug]`. The page reads only `public_stock_snapshots` and 404s for unpublished/non-indexable slugs. It renders:

- company/ticker and updated date;
- StockBox score, confidence and coverage;
- research summary;
- score dimensions;
- valuation facts such as P/E, EV/EBITDA and FCF yield when present;
- growth/profitability/financial-health metrics when present;
- red/green flags;
- source links and provenance context;
- methodology/data-source links;
- conversion CTA to run a fresh StockBox analysis;
- financial-research disclaimer.

Metadata is generated from the snapshot. JSON-LD includes BreadcrumbList and Article/WebPage publisher/date metadata, not investment-rating markup.

### 5. Crawl discovery

Update `robots.ts` so public content is crawlable while application/private routes remain blocked. Explicit rules preserve OAI-SearchBot and ChatGPT-User access to public pages. Add `host` and production-safe sitemap URL.

Convert `sitemap.ts` to an async sitemap that includes evergreen SEO pages and all indexable public stock snapshots. `lastModified` uses actual stored update timestamps rather than `new Date()` for every URL.

### 6. AI-readable site guide

Add `/llms.txt` as a plain-text route. It briefly describes what StockBox is, which public URLs contain methodology/data provenance, and that scores are analytical research outputs rather than individualized financial advice. This is supplementary discoverability and is not treated as a ranking shortcut.

### 7. IndexNow

Add a server helper and key-verification route. When an admin successfully publishes/updates a public stock snapshot and `INDEXNOW_KEY` is configured, notify IndexNow for the stock URL plus the stock hub. Publication must still succeed if IndexNow is unavailable.

### 8. Internal linking and metadata

Add links to the new SEO hubs from the public footer. Improve global/home metadata so it clearly includes stock-analysis language while preserving StockBox's source-backed positioning.

## Error handling

- Missing Supabase configuration returns empty public snapshot lists and 404 for stock pages; it must not crash the marketing site.
- Admin publication returns explicit 4xx validation errors for low-quality or unsuitable snapshots.
- IndexNow failures are non-blocking.
- Invalid slugs are treated as not found.

## Testing

Add focused Vitest coverage for:

- SEO slug generation and normalized quality thresholds;
- public-report sanitization/publication eligibility;
- metadata/description helpers where practical;
- IndexNow URL/key payload construction.

Then run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` before merge.

## Success criteria

The branch is complete when high-intent Swedish SEO routes are server-rendered and internally linked, public stock pages can only be created through explicit admin publication of high-quality balanced analyses, sitemap/robots/structured data expose those pages correctly, private application routes remain blocked, and the production build passes.