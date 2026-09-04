# Growth Visual Assets and Generative Scenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce finished carousel/static-image packages and safely enrich selected videos with short generative visual scenes when budget and provider quality allow, while guaranteeing a zero-paid-cost deterministic visual fallback.

**Architecture:** Reuse the same typed StockBox content/storyboard data used by the video factory. Deterministic Remotion still compositions create final PNG/JPG slides and ZIP packages. Generative micro-scenes sit behind a cost-aware provider interface: every request must have a known projected SEK cost and budget authorization; failure or budget denial converts the slot to motion graphics rather than blocking the render.

**Tech Stack:** TypeScript, Vitest, Remotion still rendering, JSZip, Supabase Storage, Supabase Edge orchestration, external HTTP generative-video provider adapter.

**Spec:** `docs/superpowers/specs/2026-09-04-stockbox-autonomous-growth-engine-design.md`

## Global Constraints

- Carousels/images must be finished files, not production instructions.
- Final carousel package includes individual slide PNGs plus a ZIP where supported.
- Generated video is an enhancement, never a base dependency.
- Short generative micro-scenes are attempted only when a provider has a known bounded projected cost and the global Budget Governor authorizes the call.
- If budget, provider availability, or QC prevents a generative clip, replace it with StockBox UI/motion graphics automatically.
- Total engine target <= 50 SEK/month; absolute hard cap 75 SEK/month.
- No generative-media provider may receive founder voice reference audio.
- Generated scenes must pass media/content QC before inclusion.

---

## File map

Create:
- `src/lib/growth/carousel-spec.ts`
- `src/lib/growth/generative-scenes.ts`
- `src/video/carousel/CarouselSlide.tsx`
- `src/video/carousel/StaticGrowthCard.tsx`
- `scripts/growth/render-growth-carousel.mjs`
- `scripts/growth/generative-provider.mjs`
- `scripts/growth/benchmark-generative-provider.mjs`
- `tests/growth-carousel-spec.test.ts`
- `tests/growth-generative-scenes.test.ts`
- `tests/growth-carousel-render.test.ts`
- `supabase/migrations/20260904173000_growth_render_job_kinds_v3.sql`

Modify:
- `src/lib/growth/render-spec.ts`
- `src/lib/growth/storyboard.ts`
- `scripts/growth/run-render-worker.mjs`
- `supabase/functions/stockbox-growth-engine/index.ts`
- `supabase/functions/stockbox-growth-worker-api/index.ts`
- `.github/workflows/growth-render-worker.yml`
- `.github/workflows/growth-quality-ci.yml`

### Task 1: Typed Carousel and Static Asset Contract

**Files:** `src/lib/growth/carousel-spec.ts`, `tests/growth-carousel-spec.test.ts`.

**Interfaces:** Produces `CarouselSpecSchema`, `CarouselSpec`, `CarouselSlideSpec`; a carousel contains 3-8 complete slides plus caption/CTA/content ID.

- [ ] **Step 1: Write failing schema tests**

```ts
import { expect, it } from "vitest";
import { CarouselSpecSchema } from "@/lib/growth/carousel-spec";

it("accepts a complete five-slide StockBox carousel", () => {
  const value = CarouselSpecSchema.parse({
    version: "v3", contentId: "content-1", title: "Fyra saker att kontrollera i balansräkningen",
    slides: [
      { index: 1, headline: "Börja med skulden", body: "Jämför nettoskuld med kassaflödet.", visualKind: "metric" },
      { index: 2, headline: "Titta på räntan", body: "Dyrare finansiering kan pressa resultatet.", visualKind: "chart" },
      { index: 3, headline: "Kontrollera likviditeten", body: "Kortfristiga skulder måste kunna hanteras.", visualKind: "stockbox_ui" },
      { index: 4, headline: "Se trenden", body: "En nivå säger mindre än utvecklingen över tid.", visualKind: "chart" },
      { index: 5, headline: "Samla analysen", body: "StockBox hjälper dig se helheten.", visualKind: "cta" },
    ],
    caption: "Fyra kontroller som gör balansräkningen enklare.", cta: "Analysera bolaget i StockBox",
  });
  expect(value.slides).toHaveLength(5);
});

it("rejects empty/incomplete slide sets", () => {
  expect(() => CarouselSpecSchema.parse({ version: "v3", contentId: "x", title: "x", slides: [], caption: "x", cta: "x" })).toThrow();
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-carousel-spec.test.ts
```

- [ ] **Step 3: Implement schema rules**

Require 3-8 continuous slide indexes starting at 1; headline 3-90 chars; body max 220 chars; `visualKind` in `metric | chart | stockbox_ui | icon | cta`; final slide may be CTA but previous slides must remain educational.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/growth-carousel-spec.test.ts
git add src/lib/growth/carousel-spec.ts tests/growth-carousel-spec.test.ts
git commit -m "feat: define ready carousel contract"
```

### Task 2: Render Finished Carousel Slides and ZIP

**Files:** `src/video/carousel/CarouselSlide.tsx`, `src/video/carousel/StaticGrowthCard.tsx`, `scripts/growth/render-growth-carousel.mjs`, `tests/growth-carousel-render.test.ts`, `package.json`, `package-lock.json`.

**Interfaces:** `npm run growth:carousel -- --spec <json> --out-dir <dir>` creates numbered slide PNGs, `cover.png`, `carousel.zip`, and `metadata.json`.

- [ ] **Step 1: Write failing render-plan test**

For five slides, assert output names `slide-01.png` through `slide-05.png` plus `cover.png`, `carousel.zip`, `metadata.json`.

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-carousel-render.test.ts
```

- [ ] **Step 3: Implement 1080x1350 branded still composition**

Shared layout: StockBox brand header/mark, one clear headline, readable body, structured metric/chart/UI area, slide index, CTA final slide. Keep tracked URL in platform copy rather than baking a long URL into the image.

- [ ] **Step 4: Implement render CLI with Remotion `renderStill` and JSZip**

Validate spec, render every slide and cover, build ZIP using existing `jszip`, write dimensions/checksums in metadata, and ensure no internal production instructions are emitted as final user-facing copy.

- [ ] **Step 5: Add script and smoke**

```json
{"growth:carousel":"node scripts/growth/render-growth-carousel.mjs"}
```

```bash
npm run growth:carousel -- --spec /tmp/carousel-spec.json --out-dir /tmp/carousel-smoke
```
Expected: all files exist and slide PNGs are 1080x1350.

- [ ] **Step 6: Commit**

```bash
git add src/video/carousel scripts/growth/render-growth-carousel.mjs tests/growth-carousel-render.test.ts package.json package-lock.json
git commit -m "feat: render ready StockBox carousels"
```

### Task 3: Cost-Aware Generative Scene Contract

**Files:** `src/lib/growth/generative-scenes.ts`, `src/lib/growth/render-spec.ts`, `tests/growth-generative-scenes.test.ts`.

**Interfaces:** Produces `planGenerativeScene(input): GenerativeSceneDecision`; provider exposes cost estimate before generation.

- [ ] **Step 1: Write failing decision tests**

Cover: known low cost + authorization -> generate; unknown cost -> motion fallback; projected spend above 50 for optional clip -> fallback; hard cap -> fallback; low-value scene -> fallback; duration limited to 2-5 seconds.

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-generative-scenes.test.ts
```

- [ ] **Step 3: Implement provider-neutral types**

```ts
export type GenerativeSceneRequest = {
  contentId: string;
  sceneId: string;
  prompt: string;
  durationSeconds: 2 | 3 | 4 | 5;
  aspectRatio: "9:16";
};

export interface GenerativeVideoProvider {
  name: string;
  estimateCostSek(request: GenerativeSceneRequest): Promise<number | null>;
  generate(request: GenerativeSceneRequest): Promise<{ bytes: Uint8Array; mimeType: "video/mp4"; actualCostSek?: number }>;
}
```

Each generated RenderSpec slot includes `fallbackKind: "motion_graphic"` and a complete deterministic fallback description.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/growth-generative-scenes.test.ts tests/growth-render-spec.test.ts
git add src/lib/growth/generative-scenes.ts src/lib/growth/render-spec.ts tests/growth-generative-scenes.test.ts
git commit -m "feat: add budgeted generative scene contract"
```

### Task 4: External Generative Provider Adapter and Benchmark Gate

**Files:** `scripts/growth/generative-provider.mjs`, `scripts/growth/benchmark-generative-provider.mjs`, `scripts/growth/run-render-worker.mjs`.

**Interfaces:** Production secret names `GROWTH_GENERATIVE_VIDEO_ENDPOINT` and `GROWTH_GENERATIVE_VIDEO_TOKEN`; provider enablement additionally requires `growth_generative_provider_enabled=true` and an explicit cost model in `acq_config`.

- [ ] **Step 1: Implement hard preflight**

Before request: calculate projected per-clip SEK cost; deny unknown cost; authorize global budget; enforce <=5 seconds and 9:16; timeout <=90s; max one automatic paid retry.

- [ ] **Step 2: Implement one-shot benchmark script**

Print measured JSON fields `duration_seconds`, `actual_cost_sek`, `latency_ms`, `decodable`, `usable`. Never run a paid benchmark automatically in PR CI.

- [ ] **Step 3: Enforce enablement rule**

Enable a real provider only if output is usable/decodable, per-clip cost is known, expected LLM+voice+clip monthly spend fits the 50 SEK normal target, and the 75 SEK hard cap remains enforceable. Otherwise leave real generation disabled and keep deterministic ready-to-post output.

- [ ] **Step 4: Integrate worker clip/fallback path**

Authorize, generate, decode-QC, include clip only on pass, otherwise substitute motion fallback and continue. Report estimated/actual provider usage for later ledger recording.

- [ ] **Step 5: Add `GROWTH_GENERATIVE_FAKE=1`**

Fake provider returns deterministic 3-second MP4 at zero cost for CI.

- [ ] **Step 6: Commit**

```bash
git add scripts/growth/generative-provider.mjs scripts/growth/benchmark-generative-provider.mjs scripts/growth/run-render-worker.mjs
git commit -m "feat: add optional generative growth scenes"
```

### Task 5: Add Explicit Render Job Kinds and Orchestrate Finished Visual Packages

**Files:** `supabase/migrations/20260904173000_growth_render_job_kinds_v3.sql`, `supabase/functions/stockbox-growth-engine/index.ts`, `supabase/functions/stockbox-growth-worker-api/index.ts`, `scripts/growth/run-render-worker.mjs`.

**Interfaces:** `acq_render_jobs.job_kind` is explicit `video | carousel | static_image`; final outputs are `acq_media_assets` plus platform-specific `acq_distribution_packages`.

- [ ] **Step 1: Add the exact additive migration**

```sql
alter table public.acq_render_jobs
  add column if not exists job_kind text;

update public.acq_render_jobs
set job_kind = 'video'
where job_kind is null;

alter table public.acq_render_jobs
  alter column job_kind set default 'video',
  alter column job_kind set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'acq_render_jobs_job_kind_check') then
    alter table public.acq_render_jobs add constraint acq_render_jobs_job_kind_check
      check (job_kind in ('video','carousel','static_image'));
  end if;
end $$;

create index if not exists acq_render_jobs_kind_state_idx
  on public.acq_render_jobs(job_kind, state, created_at);
```

- [ ] **Step 2: Add format selection policy using existing content candidates**

Do not create another topic engine. Select `carousel`/`static_image` from already quality-approved content according to channel fit and explore/exploit allocation; deterministic rendering is zero provider cost but still respects quality limits.

- [ ] **Step 3: Extend worker handling by `job_kind`**

Video uses video renderer; carousel uses carousel renderer and uploads every numbered slide, cover, ZIP, metadata; static image uses branded still renderer. Completion validates all expected outputs before READY.

- [ ] **Step 4: Create platform packages**

At minimum: Instagram carousel caption+UTM; Facebook image/carousel copy+UTM; LinkedIn text/image package when selected.

- [ ] **Step 5: Verify idempotent rerun**

Run the same carousel job twice in fake/integration mode and assert asset/package unique keys prevent duplicate slides, ZIPs, or platform packages.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260904173000_growth_render_job_kinds_v3.sql supabase/functions/stockbox-growth-engine/index.ts supabase/functions/stockbox-growth-worker-api/index.ts scripts/growth/run-render-worker.mjs
git commit -m "feat: produce ready growth visual packages"
```

### Task 6: CI for Visual Assets and Generated-Scene Fallback

**Files:** `.github/workflows/growth-render-worker.yml`, `.github/workflows/growth-quality-ci.yml`.

- [ ] **Step 1: Add unit tests**

Include `growth-carousel-spec`, `growth-carousel-render`, and `growth-generative-scenes` in focused CI.

- [ ] **Step 2: Add deterministic carousel smoke**

Render fixture carousel; assert PNG dimensions and ZIP entries.

- [ ] **Step 3: Add generated-scene and forced-failure smokes**

Run once with `GROWTH_GENERATIVE_FAKE=1`, once with forced provider failure. Both final videos must QC-pass; failure run reports motion fallback.

- [ ] **Step 4: Verify PR jobs cannot call paid provider**

Real provider secrets are not available to pull-request jobs.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/growth-render-worker.yml .github/workflows/growth-quality-ci.yml
git commit -m "ci: verify growth visual asset factory"
```

## Visual-assets/generative acceptance gate

Before continuing:
- carousels are real PNG files + ZIP;
- static images are final branded files;
- render job kind is explicit and typed;
- all visual assets remain private and QC-passed;
- generated micro-scenes are inserted only when budget-authorized;
- unknown-cost/failed generation automatically falls back;
- fake provider tests prove generated and fallback paths;
- a real provider is enabled only after measured cost/quality demonstrates it fits the remaining 50 SEK target budget while the 75 SEK hard cap remains enforced.
