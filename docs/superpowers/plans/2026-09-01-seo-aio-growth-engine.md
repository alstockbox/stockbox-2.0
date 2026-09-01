# StockBox SEO/AIO Growth Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-safe SEO/AIO growth layer with Swedish intent pages, explicitly published quality-gated stock snapshots, dynamic discovery metadata, and IndexNow notification.

**Architecture:** Public SEO stock pages read from a dedicated `public_stock_snapshots` table and never execute live analysis on crawler requests. Admin publication copies and sanitizes an existing balanced StockBox report after quality checks. Evergreen landing pages and stock snapshots feed a dynamic sitemap and structured metadata while private app routes stay blocked.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Supabase, Vitest, existing StockBox UI primitives.

**Spec:** `docs/superpowers/specs/2026-09-01-seo-aio-growth-engine-design.md`

## Global Constraints

- Never publish private user analyses automatically.
- Never execute a fresh provider analysis from a public crawler page request.
- Only index explicitly published snapshots passing score/confidence/coverage/freshness gates.
- Preserve source links, data dates, model version and disclaimer context.
- Do not fabricate ratings, reviews, financial figures or structured-data claims.
- Keep existing English application UX intact while targeting Swedish public search intent.

---

### Task 1: SEO domain utilities and tests

**Files:**
- Create: `src/lib/seo/public-stock.ts`
- Create: `src/lib/seo/public-stock.test.ts`

**Interfaces:**
- Produces: `slugifyStockPage(name: string): string`
- Produces: `normalizeRatio(value: number | null | undefined): number | null`
- Produces: `sanitizePublicReport(report: AnalysisReport): AnalysisReport`
- Produces: `evaluatePublicSnapshot(report: AnalysisReport): { eligible: boolean; reasons: string[] }`
- Produces: `buildStockMetaDescription(report: AnalysisReport): string`

- [ ] Write failing Vitest tests for slug normalization, 0-1 vs 0-100 confidence normalization, balanced-profile requirement, coverage/confidence gates, stale data rejection, admin QA removal and description length.
- [ ] Run `npx vitest run src/lib/seo/public-stock.test.ts` and confirm failure because implementation is absent.
- [ ] Implement the minimal utility module using existing `AnalysisReport` types.
- [ ] Re-run the focused test and confirm pass.
- [ ] Commit with `feat: add public stock SEO eligibility rules`.

### Task 2: Public snapshot persistence

**Files:**
- Create: `supabase/migrations/20260901213000_public_stock_snapshots.sql`
- Create: `src/lib/seo/public-snapshots.ts`

**Interfaces:**
- Consumes: Task 1 eligibility/sanitization helpers.
- Produces: `PublicStockSnapshot` type.
- Produces: `getPublicStockSnapshotBySlug(slug: string): Promise<PublicStockSnapshot | null>`.
- Produces: `listPublicStockSnapshots(limit?: number): Promise<PublicStockSnapshot[]>`.
- Produces: `publishAnalysisSnapshot(input: { analysisId: string; slug?: string; metaDescription?: string }): Promise<PublishResult>`.

- [ ] Add migration defining `public_stock_snapshots`, uniqueness/indexes, timestamps, RLS and a read policy restricted to `is_indexable = true`.
- [ ] Implement safe server repository functions using `createAdminClient()` and return empty/null when Supabase is unavailable.
- [ ] In publication, fetch the source analysis, cast its report, apply Task 1 quality gates, sanitize `adminQa`, derive/default slug and upsert the public snapshot.
- [ ] Ensure publication never changes the original `analyses` row.
- [ ] Commit with `feat: add explicit public stock snapshot store`.

### Task 3: Admin publication API and IndexNow

**Files:**
- Create: `src/lib/seo/indexnow.ts`
- Create: `src/lib/seo/indexnow.test.ts`
- Create: `src/app/api/admin/seo/publish/route.ts`
- Create: `src/app/api/indexnow/key/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `publishAnalysisSnapshot`.
- Produces: `buildIndexNowPayload(urls: string[], baseUrl: string, key: string)`.
- Produces: `notifyIndexNow(urls: string[]): Promise<void>`.

- [ ] Write failing tests for URL de-duplication, same-host filtering and key location construction.
- [ ] Implement IndexNow payload/notification helper. Network failure must resolve without breaking publication.
- [ ] Add `INDEXNOW_KEY=` documentation to `.env.example`.
- [ ] Add plain-text `/api/indexnow/key` route that returns 404 when no key is configured and the key when configured.
- [ ] Add admin-only POST route accepting `{ analysisId, slug?, metaDescription? }`, publishing the snapshot, then non-blockingly notifying the stock page and `/aktier`.
- [ ] Return 401 for signed-out, 403 for non-admin, 422 for validation/quality failures and 200 with publication metadata on success.
- [ ] Commit with `feat: add admin SEO publication and IndexNow`.

### Task 4: Public stock hub and stock pages

**Files:**
- Create: `src/app/aktier/page.tsx`
- Create: `src/app/aktier/[slug]/page.tsx`
- Create: `src/components/seo/seo-shell.tsx`

**Interfaces:**
- Consumes: public snapshot readers and Task 1 meta description helper.
- Produces: crawlable `/aktier` index and `/aktier/[slug]` pages.

- [ ] Build a reusable light SEO article shell from existing `Container`, `Section`, `Card`, `ButtonLink` primitives.
- [ ] Build the stock hub with explanatory copy, latest published snapshot links and CTA.
- [ ] Build stock page `generateMetadata` with canonical URL, title, description, OpenGraph and robots index/follow.
- [ ] Render score/confidence/coverage, summary, available dimensions, valuation/growth/profitability facts, flags, sources, data-as-of/model version and disclaimer.
- [ ] Add BreadcrumbList + Article/WebPage JSON-LD with publisher and date fields; omit unsupported ratings/reviews.
- [ ] Call `notFound()` for missing/non-indexable snapshots.
- [ ] Commit with `feat: add crawlable public stock research pages`.

### Task 5: High-intent Swedish landing pages

**Files:**
- Create: `src/app/aktieanalys/page.tsx`
- Create: `src/app/ai-aktieanalys/page.tsx`
- Create: `src/app/fundamental-analys/page.tsx`
- Create: `src/app/nyckeltal/pe-tal/page.tsx`

**Interfaces:**
- Consumes: SEO article shell and StockBox methodology/data-source URLs.

- [ ] Create `/aktieanalys` targeting “aktieanalys”, “aktie analys”, and “analysera aktie” with genuinely useful process content and product CTA.
- [ ] Create `/ai-aktieanalys` explaining where deterministic calculations and AI-assisted research differ, without claiming guaranteed predictions.
- [ ] Create `/fundamental-analys` explaining valuation, growth, profitability, financial health, quality and risk.
- [ ] Create `/nyckeltal/pe-tal` explaining P/E limitations, negative earnings and why lower P/E is not automatically cheaper.
- [ ] Give every page unique metadata, canonical, BreadcrumbList/WebPage schema and contextual internal links.
- [ ] Commit with `feat: add Swedish stock analysis SEO guides`.

### Task 6: Crawl discovery, AI guide and internal links

**Files:**
- Modify: `src/app/robots.ts`
- Modify: `src/app/sitemap.ts`
- Create: `src/app/llms.txt/route.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/app-shell/footer.tsx`

**Interfaces:**
- Consumes: public snapshot listing.

- [ ] Change robots base fallback to production domain, retain private path disallows, explicitly permit public crawling by OAI-SearchBot and ChatGPT-User, expose host and sitemap.
- [ ] Convert sitemap to async, add the new SEO routes and indexable stock snapshots, and use stored update timestamps rather than setting every entry to the current time.
- [ ] Add `/llms.txt` plain-text route listing StockBox purpose, methodology/data-source URLs, stock hub and research disclaimer.
- [ ] Improve global/home metadata to include clear “stock analysis / aktieanalys” intent while retaining source-backed positioning.
- [ ] Add footer internal links to `/aktier`, `/aktieanalys`, `/ai-aktieanalys`, `/fundamental-analys` and `/nyckeltal/pe-tal`.
- [ ] Commit with `feat: complete StockBox SEO crawl discovery`.

### Task 7: Verification

**Files:**
- Review all changed files.

**Interfaces:**
- Produces: verified branch ready for PR.

- [ ] Run `npm test` and fix all failures.
- [ ] Run `npm run typecheck` and fix all failures.
- [ ] Run `npm run lint` and fix all failures.
- [ ] Run `npm run build` and fix all failures.
- [ ] Inspect generated route output/build route list for all new public URLs.
- [ ] Review `git diff --check` and diff for accidental secrets, private data exposure or unsupported SEO claims.
- [ ] Commit any verification fixes with `fix: harden SEO AIO growth engine`.