# StockBox SEO/AIO Growth Engine Implementation Plan

> Historical implementation checklist, updated to reflect the architecture that now exists on `feat/seo-aio-growth-engine`. The design source of truth is `docs/superpowers/specs/2026-09-01-seo-aio-growth-engine-design.md`.

**Goal:** Build a production-safe SEO/AIO growth layer with Swedish search-intent pages, explicitly published quality-gated research snapshots, scalable crawl discovery, citeable trust documentation and low-overhead public rendering.

**Architecture:** Public research pages read from a dedicated server-only `public_stock_snapshots` publication store and never execute live provider analysis for crawler requests. Admin publication copies and sanitizes an existing eligible report after quality checks, invalidates relevant caches and submits best-effort IndexNow discovery. Evergreen guides, proof pages, paginated public research hubs and sharded sitemaps form the public crawl graph.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Supabase, Vitest, existing StockBox UI primitives.

## Global constraints

- [x] Never publish private user analyses automatically.
- [x] Never execute a fresh provider analysis from a public crawler page request.
- [x] Only index explicitly published snapshots passing score/confidence/coverage/freshness gates.
- [x] Preserve source links, data dates, model version and disclaimer context.
- [x] Do not fabricate ratings, reviews, financial figures, expertise or structured-data claims.
- [x] Keep English application UX intact while targeting Swedish public search intent.

## Implemented workstreams

### 1. Public SEO domain rules

- [x] `src/lib/seo/public-stock.ts` implements slugging, normalization, sanitization, public eligibility and meta-description helpers.
- [x] Eligibility requires balanced profile, current data, finite score, >=65% confidence and >=70% coverage.
- [x] Tests cover quality gates, sanitization and descriptions.

### 2. Dedicated public snapshot persistence

- [x] `public_stock_snapshots` migration added.
- [x] Explicit ticker uniqueness/canonicalization added.
- [x] RLS enabled.
- [x] Direct `anon` / `authenticated` SELECT and writes revoked; public rendering is service-role/server-side.
- [x] Publication preserves canonical slug and original publication time on republish.
- [x] Original private analysis remains unchanged.

### 3. Admin publication, cache invalidation and IndexNow

- [x] Admin-only publication endpoint added.
- [x] IndexNow payload/key validation covered by tests.
- [x] Site-wide key is exposed at root `/indexnow-key.txt`, not under `/api`.
- [x] IndexNow errors are best-effort/non-blocking.
- [x] Successful publication invalidates security-specific and public-list cache tags and revalidates discovery paths.
- [x] `.env.example` documents relevant SEO verification configuration.

### 4. Public research pages

- [x] `/aktier/[slug]` renders stored published snapshots only.
- [x] Dynamic metadata/canonical/robots/OpenGraph implemented.
- [x] Route-specific OpenGraph and Twitter images implemented.
- [x] BreadcrumbList + Article/WebPage structured data implemented.
- [x] Direct answerability block exposes date, score and available research facts.
- [x] Source citations, methodology, Research Standard and data-source links implemented.
- [x] Security-type presentation supports ordinary equities, investment companies and ETF-specific public factors where the underlying snapshot contains supportable data.

### 5. Scalable public research hub

- [x] `/aktier` no longer hard-caps internal discovery to a top-N set.
- [x] Hub uses paginated snapshot/count queries.
- [x] Each paginated page has its own canonical metadata.
- [x] Previous/next HTML links keep deep research reachable through the internal crawl graph.
- [x] Structured ItemList positions remain stable across pages.

### 6. Swedish high-intent and educational cluster

- [x] `/aktieanalys`
- [x] `/aktieanalys-verktyg`
- [x] `/ai-aktieanalys`
- [x] `/fundamental-analys`
- [x] `/guider`
- [x] `/guider/hur-analyserar-man-en-aktie`
- [x] `/guider/hur-varderar-man-en-aktie`
- [x] `/guider/analysera-investmentbolag`
- [x] `/guider/analysera-etf`
- [x] `/nyckeltal`
- [x] `/nyckeltal/pe-tal`
- [x] `/nyckeltal/ev-ebitda`
- [x] `/nyckeltal/roic`
- [x] `/nyckeltal/fritt-kassaflode`

The cluster uses original explanatory content and contextual internal links instead of mass-generated thin keyword variants.

### 7. Trust and proof-of-product

- [x] `/docs/methodology` exposes versioned model methodology.
- [x] `/data-sources` exposes source registry, identity/data-quality rules and limitations.
- [x] `/research-standard` documents publication thresholds, evidence boundaries and corrections.
- [x] Root Organization schema uses configured legal seller identity/contact data only when present.
- [x] Stable Organization, WebSite and SoftwareApplication entity IDs implemented.
- [x] `/sample-analysis` retained as English proof page.
- [x] `/exempel-aktieanalys` added as Swedish search-intent proof page.
- [x] Proof pages use separate canonical URLs and language alternates.

### 8. Crawl discovery and language semantics

- [x] Private application paths remain blocked from indexing.
- [x] OAI-SearchBot and ChatGPT-User can access public content.
- [x] Root static sitemap contains evergreen routes.
- [x] Public security URLs use generated `/aktier/sitemap/[id].xml` shards.
- [x] Robots advertises root + security sitemap shards.
- [x] `/llms.txt` provides supplementary site/citation guidance.
- [x] Swedish SEO routes receive `Content-Language: sv-SE`.
- [x] Footer and guide hubs expose contextual internal links.

### 9. Public rendering performance

- [x] Persistent `unstable_cache` added for stored snapshot reads, lists, counts and sitemap pages.
- [x] React request memoization retained for repeated same-request snapshot access.
- [x] Individual security cache invalidation is separated from list/sitemap invalidation.
- [x] Cache lifetime is bounded and publication can force fresh discovery.

## Verification workflow

For each behavior change:

- [x] Add a focused failing regression/contract test where practical.
- [x] Observe the expected RED CI state.
- [x] Implement the minimal GREEN change.
- [x] Run repository CI on the resulting branch head.

Repository CI verifies:

- [x] `npm run lint`
- [x] `npm run typecheck` (`next typegen && tsc --noEmit`)
- [x] full `npm test`
- [x] `npm run build`

The latest code checkpoint before this documentation sync passed all four stages, including the crawlable `/aktier` pagination change.

## Production activation checklist

These are deployment/operations steps, not reasons to weaken the code-level quality gates:

- [ ] Apply `supabase/migrations/20260901213000_public_stock_snapshots.sql` to the production database if not already applied.
- [ ] Confirm `NEXT_PUBLIC_APP_URL=https://www.getstockbox.app` in production.
- [ ] Configure a valid `INDEXNOW_KEY` if IndexNow submission is desired.
- [ ] Configure `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` when the corresponding webmaster properties are ready.
- [ ] Confirm configured legal seller fields are production-correct before relying on the Organization entity/contact surfaces.
- [ ] Deploy the branch through the normal release process.
- [ ] Verify `/robots.txt`, `/sitemap.xml`, `/aktier/sitemap/0.xml`, `/llms.txt`, `/indexnow-key.txt` (when configured) and representative public SEO pages on the production host.
- [ ] Submit/verify sitemaps in Google Search Console and Bing Webmaster Tools after deployment.
- [ ] Publish only approved, quality-gated public analyses through the admin publication flow.

## Merge/readiness rule

Do not describe the SEO/AIO branch as ready merely because individual tests pass. The current head must pass lint, typecheck, full Vitest and production build, and a final diff review must show no accidental secrets, private-data exposure, unsupported ranking promises or stale architecture references. Merge/deployment remains an explicit release decision.
