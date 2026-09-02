# StockBox SEO/AIO Growth Engine Design

## Goal

Turn StockBox from a mostly application-oriented site into a crawlable, trustworthy investor-research knowledge surface that can rank for Swedish stock-analysis intent and provide citeable public facts to search and AI systems without exposing private analyses or generating thin programmatic spam.

This document reflects the implemented PR architecture, not the original minimum scope.

## Principles

1. Public SEO content must be derived from real StockBox analysis output or carefully authored evergreen educational copy.
2. Private user analyses must never become public automatically.
3. Programmatic security pages are indexable only when a deliberately published snapshot passes data-quality gates.
4. Public pages preserve provenance, data date, model version, coverage/confidence and financial-research disclaimer context.
5. Crawler page views never trigger a provider analysis; public pages read stored snapshots only.
6. Missing financial data stays missing. No fake review/rating structured data and no unsupported financial claims.
7. Swedish public search intent is the primary SEO market while existing English application UX remains available.
8. `llms.txt`, IndexNow and crawler-specific controls are supplementary discovery mechanisms, not ranking shortcuts.

## Architecture

### 1. Evergreen search-intent and knowledge cluster

The public Swedish content surface includes:

- `/aktieanalys`
- `/aktieanalys-verktyg`
- `/ai-aktieanalys`
- `/fundamental-analys`
- `/guider`
- `/guider/hur-analyserar-man-en-aktie`
- `/guider/hur-varderar-man-en-aktie`
- `/guider/analysera-investmentbolag`
- `/guider/analysera-etf`
- `/nyckeltal`
- `/nyckeltal/pe-tal`
- `/nyckeltal/ev-ebitda`
- `/nyckeltal/roic`
- `/nyckeltal/fritt-kassaflode`
- `/research-standard`
- `/exempel-aktieanalys`
- `/aktier`

The cluster favors fewer substantive pages over thin keyword variants. Pages connect educational intent to methodology, data sources, proof-of-product and published company/security analyses.

### 2. Public stock snapshot store and privacy boundary

`public_stock_snapshots` is a dedicated Supabase publication store separate from private `analyses`. A row stores a sanitized `AnalysisReport` snapshot plus publication metadata: slug, ticker, company name, source analysis id, report JSON, score, confidence, data coverage, data-as-of date, publish/update timestamps, indexability state and meta description.

The table has RLS enabled, but `anon` and `authenticated` do **not** receive direct SELECT or write access. Public pages are server-rendered through the service-role admin client. This prevents the full stored report JSON from becoming a client-side database surface merely because a subset is rendered publicly.

Ticker uniqueness is enforced through an explicit idempotent unique index. Publication preserves the established canonical slug for a ticker and resolves slug collisions for different securities deterministically.

### 3. Explicit admin publication and quality gates

An admin-only route publishes an existing analysis into `public_stock_snapshots`. Publication is rejected unless the report satisfies the public quality contract, including:

- balanced investment profile;
- current data status;
- finite StockBox score;
- at least 65% confidence;
- at least 70% data coverage;
- valid company identity and ticker.

Admin-only QA material is removed before storage. Publication never mutates the original private analysis. Republishing an existing ticker updates its snapshot while retaining canonical identity and original publication time.

### 4. Public security pages and answerability

`/aktier/[slug]` reads only indexable stored snapshots and 404s otherwise. Pages expose a dated research snapshot with:

- company/security identity and ticker;
- StockBox Score, confidence, coverage and data date;
- direct “Snabbfakta” answer block;
- research summary and score dimensions;
- available valuation, growth, profitability, quality and balance-sheet facts;
- strengths and risks;
- source links and provenance context;
- model/methodology, Research Standard and data-source links;
- conversion CTA to run a fresh analysis;
- explicit non-advice / non-live-data context.

Security-type presentation is conditional. Ordinary equities use company fundamentals; investment companies can expose NAV/SOTP-oriented information when available; ETF pages expose ETF-specific factors rather than forcing irrelevant company multiples.

Metadata is generated from the snapshot and security type. JSON-LD uses BreadcrumbList plus Article/WebPage entities with dates, publisher, citations and the security-specific OpenGraph image. It does not encode StockBox Score as a consumer rating.

### 5. Public hub pagination and internal crawl graph

`/aktier` is a crawlable paginated HTML hub rather than a fixed top-N list. It uses cached count/page queries, exposes canonical URLs for paginated pages, stable ItemList positions and ordinary previous/next links. This keeps deep published analyses reachable through internal HTML links as the public inventory grows.

### 6. Cache and publication invalidation

Public snapshot reads use a bounded Next.js Data Cache in addition to React request memoization. Individual security snapshots have ticker/slug-specific invalidation tags; list/count/sitemap data use the shared public-list tag.

Successful publication invalidates the affected snapshot and public list/discovery caches and revalidates relevant `/aktier`, security, robots and sitemap paths. This reduces repeated Supabase work for crawlers while allowing newly published research to become discoverable promptly.

### 7. Crawl discovery and scalable sitemaps

`robots.ts` keeps private application paths out of indexing while allowing public research. Public rules include OAI-SearchBot and ChatGPT-User access without exposing private routes.

The static root sitemap contains evergreen public routes. Dynamic security URLs are split into `/aktier/sitemap/[id].xml` shards generated from the publication store, with a conservative 1,000 URLs per shard. Robots advertises the root sitemap plus generated stock sitemap shards. Stored update timestamps are used for stock `lastModified` values.

### 8. AI-readable discovery and citation guidance

`/llms.txt` is a plain-text supplemental site guide. It identifies public research, methodology, Research Standard, sources, guides, proof pages and citation expectations. It explicitly states that public company/security pages are dated snapshots and that StockBox research outputs are not individualized financial advice.

### 9. IndexNow

IndexNow uses a validated root key file at `/indexnow-key.txt`. The key must be 8–128 characters using IndexNow-compatible characters. Payloads use a root `keyLocation`, which permits site-wide URL submission. Publication sends best-effort IndexNow notifications and never fails solely because the external IndexNow endpoint is unavailable.

### 10. Trust, entity identity and proof-of-product

The root structured-data graph defines stable Organization, WebSite and SoftwareApplication entities. The Organization entity uses configured legal seller fields (legal name, organization identifier, contact information and address) only when those public commerce settings exist; no personal/private fallback data is invented.

Trust surfaces include:

- `/docs/methodology` for versioned methodology;
- `/data-sources` for source registry and data-quality limitations;
- `/research-standard` for publication, evidence and correction boundaries;
- `/sample-analysis` for the English immutable sample;
- `/exempel-aktieanalys` for the Swedish search-intent equivalent.

The English and Swedish proof pages use separate canonicals with language alternates rather than mixing languages on one canonical URL.

### 11. Language semantics and metadata

Swedish SEO routes receive `Content-Language: sv-SE` through Next.js response headers. Public pages have unique canonical metadata and structured data appropriate to their content. Stock/security pages use route-specific OpenGraph and Twitter images.

## Error handling

- Missing Supabase configuration returns empty public discovery sets or 404s rather than crashing the marketing site.
- Admin publication returns explicit validation errors for unsuitable snapshots.
- Invalid and out-of-range public hub pages return not found.
- IndexNow failures are non-blocking.
- Missing metrics are omitted or described as unavailable rather than converted to zero.
- Public rendering never requires live provider calls.

## Verification contract

The repository CI executes, in order:

1. dependency install;
2. lint;
3. Next route type generation + TypeScript typecheck;
4. full Vitest suite;
5. production Next.js build.

SEO-specific regression tests cover public eligibility, storage boundaries, canonical identity, sitemap scaling, cache invalidation, crawler/entity contracts, language headers, trust/schema contracts, answerability, security-type presentation, proof pages, guides and public hub pagination.

## Deployment requirements

Code completion is separate from production activation. Deployment requires the Supabase migration and appropriate production environment values, including the production app URL and any configured IndexNow/Search Console/Bing verification keys. Search-engine webmaster verification and sitemap submission occur after deployment.

## Success criteria

The implementation is ready for review when public research surfaces are crawlable and internally connected, private analyses remain private by default, public security snapshots can only be created through explicit quality-gated administration, sitemap/discovery scales with inventory, structured data makes only supportable claims, and the latest branch head passes lint, typecheck, the full test suite and production build.
