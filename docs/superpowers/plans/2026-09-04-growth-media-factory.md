# Growth Media Factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a validated v3 RenderSpec into a fully rendered, QC-passing, private ready-to-post StockBox MP4/cover package with Swedish cloned voice, without founder recording or editing.

**Architecture:** A scheduled GitHub Actions worker claims durable render jobs from a narrowly authenticated Supabase Edge worker API. It requests Swedish speech from a replaceable external voice worker, renders deterministic Remotion templates, validates the result with FFmpeg/ffprobe, uploads assets through short-lived signed upload URLs, and marks the job complete. The base video is template-driven; generated micro-scenes remain optional and fall back to StockBox UI/motion graphics.

**Tech Stack:** Node 22, TypeScript, Remotion, FFmpeg/ffprobe, GitHub Actions, Supabase Edge Functions/Storage, Python + Modal for the initial Chatterbox-compatible voice worker.

**Spec:** `docs/superpowers/specs/2026-09-04-stockbox-autonomous-growth-engine-design.md`

## Global Constraints

- One master 1080x1920 9:16 MP4 is optimized for Instagram/Facebook Reels and reused on TikTok/YouTube Shorts.
- Normal automated video duration: 20-60 seconds.
- Swedish automated voice must use the approved founder voice identity; never silently substitute an unrelated Swedish voice.
- Founder voice reference audio remains in private Supabase Storage, never GitHub.
- Voice reference signed URLs are short-lived and must not be printed in logs.
- Base rendering must work without generated video scenes.
- Total recurring engine spend target <= 50 SEK/month; absolute hard ceiling 75 SEK/month.
- Paid voice/generative calls must be authorized by the global budget ledger before invocation.
- A failed or partially uploaded render may never become READY.
- Worker retries must be idempotent and may not duplicate media/package rows.

---

## File map

Create:
- `src/video/Root.tsx` — Remotion root registration.
- `src/video/GrowthVideo.tsx` — composition entry accepting validated RenderSpec.
- `src/video/templates/EducationalChecklist.tsx`
- `src/video/templates/StockAnalysis.tsx`
- `src/video/templates/InvestorWarning.tsx`
- `src/video/templates/StockBoxDemo.tsx`
- `src/video/templates/CompanyComparison.tsx`
- `src/video/components/SafeSubtitles.tsx`
- `src/video/components/StockBoxFrame.tsx`
- `src/video/components/GrowthCta.tsx`
- `src/video/render-adapter.ts` — converts persisted RenderSpec JSON to composition props.
- `scripts/growth/render-growth-video.mjs`
- `scripts/growth/validate-growth-video.mjs`
- `tests/growth-render-adapter.test.ts`
- `tests/growth-media-qc.test.ts`
- `workers/growth-voice/modal_app.py`
- `workers/growth-voice/requirements.txt`
- `workers/growth-voice/README.md`
- `supabase/functions/stockbox-growth-worker-api/index.ts`
- `.github/workflows/growth-render-worker.yml`
- `tests/growth-worker-contract.test.ts`

Modify:
- `package.json` / lockfile — Remotion and render scripts.
- `.github/workflows/growth-quality-ci.yml` — include render contract/QC tests; keep full MP4 smoke in the dedicated render workflow.

### Task 1: Add Remotion and a Deterministic Smoke Composition

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/video/Root.tsx`
- Create: `src/video/GrowthVideo.tsx`
- Create: `src/video/render-adapter.ts`
- Test: `tests/growth-render-adapter.test.ts`

**Interfaces:**
- Consumes: `RenderSpec` from `src/lib/growth/render-spec.ts`.
- Produces: `toGrowthCompositionProps(spec): GrowthCompositionProps` and Remotion composition id `GrowthVideo`.

- [ ] **Step 1: Install Remotion packages**

Run:
```bash
npm install remotion @remotion/cli @remotion/renderer
```
Expected: package.json and lockfile change with one compatible Remotion version across packages.

- [ ] **Step 2: Write a failing render-adapter test**

```ts
import { expect, it } from "vitest";
import { toGrowthCompositionProps } from "@/video/render-adapter";

it("derives total frames from the final scene at 30fps", () => {
  const props = toGrowthCompositionProps({
    version: "v3",
    contentId: "content-1",
    renderJobId: "job-1",
    language: "sv",
    template: "educational_checklist",
    title: "Tre risker",
    hook: "Tre risker på 30 sekunder",
    script: "Test",
    voiceMode: "educational",
    scenes: [{ id: "s1", kind: "stockbox_ui", startMs: 0, endMs: 30000, headline: "Risk" }],
    subtitles: [],
    cta: { text: "Testa StockBox", url: "https://www.getstockbox.app/" },
  });
  expect(props.fps).toBe(30);
  expect(props.durationInFrames).toBe(900);
});
```

- [ ] **Step 3: Run and verify RED**

```bash
npm test -- tests/growth-render-adapter.test.ts
```
Expected: FAIL because the adapter does not exist.

- [ ] **Step 4: Implement the adapter and composition root**

`render-adapter.ts` must parse input through `RenderSpecSchema` before deriving:
```ts
export type GrowthCompositionProps = {
  spec: RenderSpec;
  fps: 30;
  width: 1080;
  height: 1920;
  durationInFrames: number;
  voiceAudioSrc?: string;
};
```

`Root.tsx` registers a single `GrowthVideo` composition whose duration metadata is calculated from props rather than hard-coded.

- [ ] **Step 5: Run test and typecheck**

```bash
npm test -- tests/growth-render-adapter.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/video tests/growth-render-adapter.test.ts
git commit -m "feat: add growth video render shell"
```

### Task 2: Implement the Five StockBox-First Templates

**Files:**
- Create: `src/video/templates/EducationalChecklist.tsx`
- Create: `src/video/templates/StockAnalysis.tsx`
- Create: `src/video/templates/InvestorWarning.tsx`
- Create: `src/video/templates/StockBoxDemo.tsx`
- Create: `src/video/templates/CompanyComparison.tsx`
- Create: `src/video/components/SafeSubtitles.tsx`
- Create: `src/video/components/StockBoxFrame.tsx`
- Create: `src/video/components/GrowthCta.tsx`
- Modify: `src/video/GrowthVideo.tsx`
- Test: `tests/growth-video-template-selection.test.ts`

**Interfaces:**
- Consumes: `RenderTemplate` and `SceneKind` from RenderSpec.
- Produces: `selectGrowthTemplate(template)` returning the exact React component for the five approved template IDs.

- [ ] **Step 1: Write failing template-selection tests**

Assert every approved template maps to a different named component and an unknown template is rejected by the schema before rendering.

```ts
expect(selectGrowthTemplate("educational_checklist").displayName).toBe("EducationalChecklist");
expect(selectGrowthTemplate("stockbox_demo").displayName).toBe("StockBoxDemo");
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- tests/growth-video-template-selection.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement shared safe-zone components**

Rules that must be encoded in components, not left to individual templates:
- subtitles: keep text within central safe width and away from bottom platform controls;
- CTA: final 3-5 seconds, StockBox name + concise action;
- no platform URL rendered as tiny body text;
- all animations use transforms/opacity rather than layout-thrashing measurements;
- scenes with missing optional generated media fall back to `StockBoxFrame` or motion-graphic block.

- [ ] **Step 4: Implement each template as a thin composition over shared components**

Each template must consume the same `GrowthCompositionProps`; no template-specific DB calls or network requests are allowed inside React rendering.

- [ ] **Step 5: Run tests/typecheck**

```bash
npm test -- tests/growth-video-template-selection.test.ts tests/growth-render-adapter.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/video tests/growth-video-template-selection.test.ts
git commit -m "feat: add StockBox growth video templates"
```

### Task 3: Render CLI and Technical QC

**Files:**
- Create: `scripts/growth/render-growth-video.mjs`
- Create: `scripts/growth/validate-growth-video.mjs`
- Create: `src/lib/growth/media-qc.ts`
- Test: `tests/growth-media-qc.test.ts`
- Modify: `package.json`

**Interfaces:**
- `npm run growth:render -- --spec <path> --voice <path> --out <path>` renders one MP4.
- `npm run growth:qc -- --video <path>` emits JSON QC summary and exits non-zero on hard failure.
- `evaluateMediaQc(metadata): QcSummary` is pure and unit-tested.

- [ ] **Step 1: Write failing QC policy tests**

Cover:
- pass for 1080x1920, H.264, AAC, audio present, 20-60s;
- fail wrong dimensions;
- fail missing audio;
- fail duration outside bounds;
- fail black-terminal-frame ratio above configured tolerance;
- pass when optional generated scene metadata is absent.

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- tests/growth-media-qc.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement pure QC policy**

Expose:
```ts
export function evaluateMediaQc(input: {
  width: number;
  height: number;
  durationSeconds: number;
  videoCodec: string;
  audioCodec: string | null;
  hasAudio: boolean;
  integratedLufs?: number | null;
  terminalBlackRatio?: number | null;
}): QcSummary;
```

Hard requirements: 1080x1920, 20-60s, H.264 family, audio present, AAC output after normalization.

- [ ] **Step 4: Implement CLI rendering and ffprobe extraction**

`render-growth-video.mjs`:
1. read JSON spec;
2. validate it by invoking the compiled TypeScript adapter through the project runtime path used by Remotion;
3. render `GrowthVideo` to a temporary MP4;
4. run FFmpeg loudness normalization to final H.264/AAC output;
5. never print signed URLs or secrets.

`validate-growth-video.mjs`:
1. execute `ffprobe -v error -show_streams -show_format -of json`;
2. derive metadata;
3. run a short black-frame analysis on terminal frames;
4. call the same QC thresholds represented in `media-qc.ts`;
5. print only the QC JSON summary.

- [ ] **Step 5: Add scripts**

```json
{
  "growth:render": "node scripts/growth/render-growth-video.mjs",
  "growth:qc": "node scripts/growth/validate-growth-video.mjs"
}
```

- [ ] **Step 6: Produce a local 3-scene fixture render**

Use a fixture spec under a temporary directory, not committed voice material. Render with a generated silence/test tone audio file.

Run:
```bash
npm run growth:render -- --spec /tmp/growth-spec.json --voice /tmp/test-voice.wav --out /tmp/growth-smoke.mp4
npm run growth:qc -- --video /tmp/growth-smoke.mp4
```
Expected: QC exits 0 and reports 1080x1920 with audio.

- [ ] **Step 7: Commit**

```bash
git add scripts/growth src/lib/growth/media-qc.ts tests/growth-media-qc.test.ts package.json package-lock.json
git commit -m "feat: render and validate growth videos"
```

### Task 4: Chatterbox-Compatible Swedish Voice Worker on Modal

**Files:**
- Create: `workers/growth-voice/modal_app.py`
- Create: `workers/growth-voice/requirements.txt`
- Create: `workers/growth-voice/README.md`

**Interfaces:**
- HTTP request body: `{request_id, text, language:"sv", voice_mode, reference_audio_url}`.
- HTTP response: WAV bytes on success; JSON error with stable `code` on failure.
- Authentication: `Authorization: Bearer <GROWTH_VOICE_WORKER_TOKEN>`.

- [ ] **Step 1: Implement request validation before model loading**

Reject:
- non-Swedish `language` for founder clone endpoint;
- text > 1,500 characters;
- missing/unsupported voice mode;
- non-HTTPS reference URL;
- missing worker bearer token.

Do not log `reference_audio_url`.

- [ ] **Step 2: Implement model/provider adapter**

Keep model code behind:
```py
def synthesize_founder_voice(text: str, reference_path: str, voice_mode: str) -> bytes:
    ...
```

The initial implementation uses the approved Chatterbox-compatible multilingual model. Map modes to bounded expressiveness/speed settings; do not alter speaker identity by selecting a different speaker.

- [ ] **Step 3: Download reference audio into an ephemeral temp directory**

Requirements:
- request timeout <= 20s;
- maximum accepted reference file size 25 MB;
- delete temp reference and generated WAV in `finally`;
- never persist reference audio in Modal Volume or image layers.

- [ ] **Step 4: Add a local contract test mode**

Provide a `VOICE_WORKER_FAKE=1` path that returns deterministic test WAV without loading the GPU model. This is used in CI and must never be selected in production unless explicitly configured.

- [ ] **Step 5: Document one-time deployment and secrets**

README must list only secret names, never secret values:
```text
GROWTH_VOICE_WORKER_TOKEN
```

Deployment command:
```bash
modal deploy workers/growth-voice/modal_app.py
```

Document that the resulting HTTPS endpoint URL is stored as a Supabase secret/config value, not committed as a credential.

- [ ] **Step 6: Commit**

```bash
git add workers/growth-voice
git commit -m "feat: add Swedish growth voice worker"
```

### Task 5: Secure Supabase Worker Claim/Upload/Completion API

**Files:**
- Create: `supabase/functions/stockbox-growth-worker-api/index.ts`
- Test: `tests/growth-worker-contract.test.ts`

**Interfaces:**
- `POST {action:"claim"}` -> one queued job plus signed input/output URLs.
- `POST {action:"complete", job_id, assets, qc}` -> verifies claimed job and marks READY only when QC passes.
- `POST {action:"fail", job_id, code, retryable}` -> increments attempts and requeues or fails according to configured max attempts.
- Authentication header: `x-stockbox-growth-worker-token` matched against Edge secret.

- [ ] **Step 1: Write failing pure contract tests**

Extract request parsing/state transition helpers to a side-effect-free module within the function folder so Vitest can test:
- invalid worker token -> 401;
- claim only transitions `queued -> storyboarding` atomically;
- completion with `qc.passed=false` cannot set `ready`;
- second completion for the same idempotency key is a no-op/same result;
- retryable failure below max attempts returns job to `queued`;
- non-retryable or max-attempt failure sets `failed`.

- [ ] **Step 2: Implement worker authentication and atomic claim RPC/SQL path**

Use one database operation that selects one queued job `for update skip locked` and stamps `worker_id`, `claimed_at`, `attempt_count+1`. Do not implement claim as separate SELECT then UPDATE requests.

- [ ] **Step 3: Generate short-lived signed input and upload URLs server-side**

For claim response:
- voice reference: signed read URL from `growth-voice-private`, TTL from `growth_voice_signed_url_ttl_seconds` (default 600);
- source screenshots if private: signed read URLs;
- output targets: signed upload URLs for staging voice WAV, master MP4, cover JPG, metadata JSON.

Return signed URLs only in the authenticated JSON response and set `Cache-Control: no-store`.

- [ ] **Step 4: Implement completion validation**

Before READY:
- `qc.passed === true`;
- required asset kinds include `master_video` and `cover`;
- asset paths match the current job/content ID prefix;
- checksums supplied;
- create/upsert `acq_media_assets` using idempotency keys;
- update `acq_render_jobs.state='ready'` in the same logical transaction/RPC.

- [ ] **Step 5: Run contract tests**

```bash
npm test -- tests/growth-worker-contract.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/stockbox-growth-worker-api tests/growth-worker-contract.test.ts
git commit -m "feat: add secure growth render worker API"
```

### Task 6: Scheduled GitHub Render Worker

**Files:**
- Create: `.github/workflows/growth-render-worker.yml`
- Create: `scripts/growth/run-render-worker.mjs`

**Interfaces:**
- Worker is cloud-only; founder laptop is not required.
- It polls the secure Edge worker API hourly and can also be run manually with `workflow_dispatch`.
- It processes at most 2 jobs per run to match daily production limits and control runtime.

- [ ] **Step 1: Add workflow with explicit concurrency**

```yaml
name: Growth Render Worker
on:
  schedule:
    - cron: "17 * * * *"
  workflow_dispatch:

concurrency:
  group: growth-render-worker
  cancel-in-progress: false

jobs:
  render:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: sudo apt-get update && sudo apt-get install -y ffmpeg
      - run: node scripts/growth/run-render-worker.mjs
        env:
          SUPABASE_URL: ${{ secrets.GROWTH_SUPABASE_URL }}
          GROWTH_WORKER_TOKEN: ${{ secrets.GROWTH_WORKER_TOKEN }}
          GROWTH_VOICE_ENDPOINT: ${{ secrets.GROWTH_VOICE_ENDPOINT }}
          GROWTH_VOICE_WORKER_TOKEN: ${{ secrets.GROWTH_VOICE_WORKER_TOKEN }}
```

- [ ] **Step 2: Implement claim loop without secret logging**

`run-render-worker.mjs` does for max two jobs:
1. POST `claim`;
2. if 204/no job, exit success;
3. fetch permitted source assets with `redirect:'error'` or validated HTTPS hosts;
4. call voice endpoint with bearer token;
5. render MP4 and cover;
6. QC;
7. PUT each output to its signed upload URL;
8. POST `complete` with path/checksum/QC;
9. on error POST `fail` with stable code and retryable classification.

Do not echo response bodies containing signed URLs.

- [ ] **Step 3: Add a fake-worker integration mode**

When `GROWTH_WORKER_FAKE=1`, replace network claim with a local fixture and voice call with a deterministic WAV. This allows an actual MP4 render in CI without secrets or paid calls.

- [ ] **Step 4: Run fake worker locally**

```bash
GROWTH_WORKER_FAKE=1 node scripts/growth/run-render-worker.mjs
```
Expected: writes a temporary QC-passing MP4 and exits 0 without network access.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/growth-render-worker.yml scripts/growth/run-render-worker.mjs
git commit -m "feat: add cloud growth render worker"
```

### Task 7: Dedicated Real MP4 Smoke Gate

**Files:**
- Modify: `.github/workflows/growth-render-worker.yml`
- Modify: `.github/workflows/growth-quality-ci.yml`

**Interfaces:**
- PR CI proves the renderer produces a decodable vertical MP4 with audio using only free deterministic fixtures.
- Production worker job remains secret-gated and does not run paid voice during PR checks.

- [ ] **Step 1: Add a PR-triggered `smoke` job**

Trigger paths include:
```yaml
- "src/video/**"
- "scripts/growth/**"
- "src/lib/growth/media-qc.ts"
- "src/lib/growth/render-spec.ts"
- "workers/growth-voice/**"
- "supabase/functions/stockbox-growth-worker-api/**"
```

Smoke steps:
```bash
npm ci
sudo apt-get update && sudo apt-get install -y ffmpeg
GROWTH_WORKER_FAKE=1 node scripts/growth/run-render-worker.mjs
```

- [ ] **Step 2: Keep focused unit/type/build CI separate**

Extend Growth Quality CI unit command with:
```text
tests/growth-render-adapter.test.ts
tests/growth-video-template-selection.test.ts
tests/growth-media-qc.test.ts
tests/growth-worker-contract.test.ts
```

- [ ] **Step 3: Verify both workflows on a PR before merging media code**

Expected:
- Growth Quality CI: targeted tests PASS, typecheck PASS, Next build PASS.
- Growth Render Worker smoke: fake end-to-end MP4 render PASS.
- No provider token or signed URL appears in logs.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/growth-render-worker.yml .github/workflows/growth-quality-ci.yml
git commit -m "ci: verify autonomous growth video rendering"
```

## Media-factory acceptance gate

Before moving to intelligence/orchestration:
- a fake end-to-end job creates a QC-passing 1080x1920 MP4 with audio;
- all five templates render from the same typed RenderSpec interface;
- missing generated micro-scenes fall back deterministically;
- real Swedish voice inference is isolated behind one authenticated HTTP adapter;
- founder reference audio is retrieved only by short-lived private URL and deleted after inference;
- worker cannot set READY on failed QC;
- repeated completion does not duplicate assets;
- GitHub worker runs without founder computer;
- no paid operation can execute unless the later orchestrator has created a budget-authorized job.
