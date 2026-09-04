# Growth Visual Assets and Generative Scenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce finished carousel/static-image packages and safely enrich selected videos with short generative visual scenes when budget and provider quality allow, while guaranteeing a zero-paid-cost deterministic visual fallback.

**Architecture:** Reuse the same typed StockBox content/storyboard data used by the video factory. Deterministic Remotion still compositions create final PNG/JPG slides and ZIP packages. Generative micro-scenes sit behind a cost-aware provider interface: every request must have a known projected SEK cost and budget authorization; failure or budget denial converts the slot to motion graphics rather than blocking the render.

**Tech Stack:** TypeScript, Vitest, Remotion still rendering, JSZip, Supabase Storage, Supabase Edge orchestration, external HTTP generative-video provider adapter.

**Spec:** `docs/superpowers/specs/2026-09-04-stockbox-autonomous-growth-engine-design.md`

## Global Constraints

- Carousels/images must be finished files, not instructions such as “Slide 1 should say…”.
- Final carousel package includes individual slide PNGs plus a ZIP where supported.
- Generated video is an enhancement, never a base dependency.
- Short generative micro-scenes are attempted only when a provider has a known bounded projected cost and the global Budget Governor authorizes the call.
- If the monthly target/cap, provider availability, or QC prevents a generative clip, replace it with StockBox UI/motion graphics automatically.
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
- `tests/growth-carousel-spec.test.ts`
- `tests/growth-generative-scenes.test.ts`
- `tests/growth-carousel-render.test.ts`

Modify:
- `src/lib/growth/render-spec.ts`
- `src/lib/growth/storyboard.ts`
- `scripts/growth/run-render-worker.mjs`
- `supabase/functions/stockbox-growth-engine/index.ts`
- `supabase/functions/stockbox-growth-worker-api/index.ts`
- `.github/workflows/growth-render-worker.yml`

### Task 1: Typed Carousel and Static Asset Contract

**Files:**
- Create: `src/lib/growth/carousel-spec.ts`
- Test: `tests/growth-carousel-spec.test.ts`

**Interfaces:**
- Produces `CarouselSpecSchema`, `CarouselSpec`, `CarouselSlideSpec`.
- A carousel contains 3-8 slides, each with headline/body/visual hint, plus caption/CTA/content ID.

- [ ] **Step 1: Write failing schema tests**

```ts
import { expect, it } from "vitest";
import { CarouselSpecSchema } from "@/lib/growth/carousel-spec";

it("accepts a complete five-slide StockBox carousel", () => {
  const value = CarouselSpecSchema.parse({
    version: "v3",
    contentId: "content-1",
    title: "Fyra saker att kontrollera i balansräkningen",
    slides: [
      { index: 1, headline: "Börja med skulden", body: "Jämför nettoskuld med kassaflödet.", visualKind: "metric" },
      { index: 2, headline: "Titta på räntan", body: "Dyrare finansiering kan pressa resultatet.", visualKind: "chart" },
      { index: 3, headline: "Kontrollera likviditeten", body: "Kortfristiga skulder måste kunna hanteras.", visualKind: "stockbox_ui" },
      { index: 4, headline: "Se trenden", body: "En nivå säger mindre än utvecklingen över tid.", visualKind: "chart" },
      { index: 5, headline: "Samla analysen", body: "StockBox hjälper dig se helheten.", visualKind: "cta" },
    ],
    caption: "Fyra kontroller som gör balansräkningen enklare.",
    cta: "Analysera bolaget i StockBox",
  });
  expect(value.slides).toHaveLength(5);
});

it("rejects instruction-only or empty slides", () => {
  expect(() => CarouselSpecSchema.parse({ version: "v3", contentId: "x", title: "x", slides: [], caption: "x", cta: "x" })).toThrow();
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/growth-carousel-spec.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement Zod schema**

Rules:
- 3-8 slides;
- continuous indexes starting at 1;
- headline 3-90 chars;
- body 0-220 chars;
- `visualKind` enum `metric | chart | stockbox_ui | icon | cta`;
- final slide may be CTA but other slides must still provide educational value.

- [ ] **Step 4: Run test and commit**

```bash
npm test -- tests/growth-carousel-spec.test.ts
git add src/lib/growth/carousel-spec.ts tests/growth-carousel-spec.test.ts
git commit -m "feat: define ready carousel contract"
```

### Task 2: Render Finished Carousel Slides and ZIP

**Files:**
- Create: `src/video/carousel/CarouselSlide.tsx`
- Create: `src/video/carousel/StaticGrowthCard.tsx`
- Create: `scripts/growth/render-growth-carousel.mjs`
- Test: `tests/growth-carousel-render.test.ts`

**Interfaces:**
- CLI: `npm run growth:carousel -- --spec <json> --out-dir <dir>`.
- Produces `slide-01.png ... slide-N.png`, `cover.png`, `carousel.zip`, and `metadata.json`.

- [ ] **Step 1: Write failing pure naming/render-plan test**

Assert five slides create exactly:
```text
slide-01.png
slide-02.png
slide-03.png
slide-04.png
slide-05.png
cover.png
carousel.zip
metadata.json
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/growth-carousel-render.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement branded still composition**

Use 1080x1350 for feed carousel slides. Shared layout rules:
- StockBox brand header/mark;
- one clear headline;
- readable body text;
- structured metric/chart/UI area;
- slide index except cover/CTA when visually unnecessary;
- CTA final slide;
- no permanent tracking URL baked into image unless specifically desired; the tracked URL belongs in platform copy.

- [ ] **Step 4: Implement render CLI using Remotion `renderStill`**

For each slide:
1. validate CarouselSpec;
2. render PNG;
3. render cover from slide 1/title;
4. create ZIP using existing `jszip` dependency;
5. write metadata with checksums and dimensions;
6. never include internal instructions in final files.

- [ ] **Step 5: Add package script and run smoke**

Add:
```json
"growth:carousel": "node scripts/growth/render-growth-carousel.mjs"
```

Run with deterministic fixture:
```bash
npm run growth:carousel -- --spec /tmp/carousel-spec.json --out-dir /tmp/carousel-smoke
```
Expected: all required files exist and PNG dimensions are 1080x1350.

- [ ] **Step 6: Commit**

```bash
git add src/video/carousel scripts/growth/render-growth-carousel.mjs tests/growth-carousel-render.test.ts package.json package-lock.json
git commit -m "feat: render ready StockBox carousels"
```

### Task 3: Cost-Aware Generative Scene Provider Contract

**Files:**
- Create: `src/lib/growth/generative-scenes.ts`
- Test: `tests/growth-generative-scenes.test.ts`
- Modify: `src/lib/growth/render-spec.ts`

**Interfaces:**
- Produces `planGenerativeScene(input): GenerativeSceneDecision`.
- Provider adapter must expose `estimateCostSek(request): number | null` before `generate(request)`.

- [ ] **Step 1: Write failing decision tests**

Cover:
- known low cost + budget authorization -> `generate`;
- unknown provider cost -> `motion_fallback`;
- projected monthly spend over 50 for optional clip -> `motion_fallback`;
- hard cap -> `motion_fallback`;
- scene does not materially improve meaning -> `motion_fallback`;
- generated scene duration limited to 2-5 seconds.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/growth-generative-scenes.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement provider-neutral request and decision types**

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

`planGenerativeScene()` must return a deterministic fallback reason when generation is skipped.

- [ ] **Step 4: Extend RenderSpec generated scene metadata**

A generated slot must include `fallbackKind:'motion_graphic'` and a deterministic fallback description so rendering never depends on the external clip.

- [ ] **Step 5: Run tests and commit**

```bash
npm test -- tests/growth-generative-scenes.test.ts tests/growth-render-spec.test.ts
git add src/lib/growth/generative-scenes.ts src/lib/growth/render-spec.ts tests/growth-generative-scenes.test.ts
git commit -m "feat: add budgeted generative scene contract"
```

### Task 4: External Generative Provider Adapter with Mandatory Benchmark Gate

**Files:**
- Create: `scripts/growth/generative-provider.mjs`
- Create: `scripts/growth/benchmark-generative-provider.mjs`
- Modify: `scripts/growth/run-render-worker.mjs`

**Interfaces:**
- Production configuration uses secret names `GROWTH_GENERATIVE_VIDEO_ENDPOINT` and `GROWTH_GENERATIVE_VIDEO_TOKEN` plus a non-secret cost model config.
- Provider is considered enabled only when `growth_generative_provider_enabled=true` and a benchmarked cost model is present in `acq_config`.

- [ ] **Step 1: Implement adapter with a hard preflight**

Before any provider request:
1. calculate projected per-clip SEK cost from configured provider cost model;
2. if unknown, do not send request;
3. call global budget authorization;
4. enforce duration <=5s and 9:16;
5. set request timeout <=90s;
6. never retry a paid generation automatically more than once.

- [ ] **Step 2: Implement benchmark script**

Benchmark performs at most one explicitly authorized test generation and prints:
```json
{
  "duration_seconds": 3,
  "actual_cost_sek": 0.0,
  "latency_ms": 0,
  "decodable": true,
  "usable": true
}
```
with real values. It must not be run automatically in PR CI because it may incur cost.

- [ ] **Step 3: Add enablement rule**

Do not enable generative scenes in production until:
- provider output is decodable/usable;
- per-clip cost is known;
- projected monthly spend including LLM + voice + expected clip frequency stays within 50 SEK target under normal mode;
- 75 SEK hard cap remains enforceable.

If no provider meets that at implementation time, keep the adapter disabled and use the already-implemented motion fallback. This is a valid budget-safe production state; it does not block ready-to-post video.

- [ ] **Step 4: Integrate optional clip into worker**

For each generated slot:
- ask decision policy;
- generate only if approved;
- run ffprobe/decode QC on clip;
- if provider/QC fails, replace with fallback scene and continue rendering;
- report estimated/actual spend to worker completion payload for normalized budget ledger recording.

- [ ] **Step 5: Add fake provider mode to CI**

`GROWTH_GENERATIVE_FAKE=1` returns a deterministic 3-second fixture video at cost 0 so the render worker can prove insertion/fallback logic without an external call.

- [ ] **Step 6: Commit**

```bash
git add scripts/growth/generative-provider.mjs scripts/growth/benchmark-generative-provider.mjs scripts/growth/run-render-worker.mjs
git commit -m "feat: add optional generative growth scenes"
```

### Task 5: Orchestrate Ready Static/Carousel Packages

**Files:**
- Modify: `supabase/functions/stockbox-growth-engine/index.ts`
- Modify: `supabase/functions/stockbox-growth-worker-api/index.ts`
- Modify: `scripts/growth/run-render-worker.mjs`

**Interfaces:**
- Quality-approved selected content may produce `asset_kind='carousel' | 'static_image'` jobs alongside videos.
- Final assets are recorded in `acq_media_assets` and platform copy in `acq_distribution_packages`.

- [ ] **Step 1: Add asset selection policy**

Use existing content selection; do not create a second unrelated topic engine. Pick carousel/static formats according to channel fit and explore/exploit allocation. Free deterministic asset rendering has zero provider cost but still respects daily quality limits.

- [ ] **Step 2: Add worker job kind**

Extend durable render jobs with explicit `job_kind` (`video | carousel | static_image`) via a new additive migration if the foundation schema did not include it. Do not overload template name to infer job type.

- [ ] **Step 3: Render/upload carousel outputs**

Worker requests signed upload URLs for each slide, cover, ZIP, and metadata. Completion validates all expected slide indexes before setting asset/package READY.

- [ ] **Step 4: Create platform packages**

At minimum:
- Instagram carousel caption + UTM;
- Facebook image/carousel post copy + UTM;
- LinkedIn text/image package where selected.

- [ ] **Step 5: Test idempotent reruns**

Running the same carousel job twice must upsert identical asset/package IDs and not duplicate slides or ZIP rows.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/stockbox-growth-engine/index.ts supabase/functions/stockbox-growth-worker-api/index.ts scripts/growth/run-render-worker.mjs supabase/migrations
git commit -m "feat: produce ready growth visual packages"
```

### Task 6: Extend Render CI for Visual Assets and Generated-Scene Fallback

**Files:**
- Modify: `.github/workflows/growth-render-worker.yml`
- Modify: `.github/workflows/growth-quality-ci.yml`

- [ ] **Step 1: Add unit tests to focused CI**

Include:
```text
tests/growth-carousel-spec.test.ts
tests/growth-carousel-render.test.ts
tests/growth-generative-scenes.test.ts
```

- [ ] **Step 2: Add deterministic carousel smoke**

CI renders a fixture carousel and asserts PNG dimensions + ZIP entries.

- [ ] **Step 3: Add fake-generated-scene video smoke**

Run worker once with `GROWTH_GENERATIVE_FAKE=1`, then once with forced provider failure. Both must produce QC-passing final MP4s; the second must report `motion_fallback`.

- [ ] **Step 4: Verify no paid external generation occurs in PR CI**

No real generative provider secrets are made available to pull-request jobs.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/growth-render-worker.yml .github/workflows/growth-quality-ci.yml
git commit -m "ci: verify growth visual asset factory"
```

## Visual-assets/generative acceptance gate

Before production promotion:
- carousel output is actual PNG files + ZIP, not instructions;
- static image output is a final branded file;
- all assets use private storage and passed QC;
- generated micro-scenes can be inserted when explicitly budget-authorized;
- unknown-cost or failed generation always falls back automatically;
- fake provider tests prove both generated and fallback paths;
- real provider is enabled only after a measured cost/quality benchmark demonstrates it fits the remaining 50 SEK target budget; hard cap 75 SEK remains enforced.
