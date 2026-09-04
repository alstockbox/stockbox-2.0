# Growth Media Factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a validated v3 RenderSpec into a fully rendered, QC-passing, private ready-to-post StockBox MP4/cover package with Swedish cloned voice, without founder recording or editing.

**Architecture:** A scheduled GitHub Actions worker claims durable render jobs from a narrowly authenticated Supabase Edge worker API. It requests Swedish speech from a replaceable external voice worker, renders deterministic Remotion templates, validates the result with FFmpeg/ffprobe, uploads assets through short-lived signed upload URLs, and marks the job complete. Generated scenes are optional; the base video always renders from StockBox UI/motion graphics.

**Tech Stack:** Node 22, TypeScript, Remotion, FFmpeg/ffprobe, GitHub Actions, Supabase Edge Functions/Storage, Python + Modal for the initial Chatterbox-compatible voice worker.

**Spec:** `docs/superpowers/specs/2026-09-04-stockbox-autonomous-growth-engine-design.md`

## Global Constraints

- One master 1080x1920 9:16 MP4 is optimized for Instagram/Facebook Reels and reused on TikTok/YouTube Shorts.
- Normal automated video duration: 20-60 seconds.
- Swedish automated voice must use the approved founder voice identity; never silently substitute an unrelated Swedish voice.
- Founder voice reference audio remains private Supabase Storage data and never enters GitHub.
- Signed reference URLs are short-lived and never printed in logs.
- Base rendering must work with zero generated-video scenes.
- Total recurring engine spend target <= 50 SEK/month; absolute hard ceiling 75 SEK/month.
- Paid voice/generative calls require prior global budget authorization.
- Failed or partially uploaded renders never become READY.
- Worker retries are idempotent and cannot duplicate assets/packages.

---

## File map

Create:
- `src/video/Root.tsx`
- `src/video/GrowthVideo.tsx`
- `src/video/render-adapter.ts`
- `src/video/templates/EducationalChecklist.tsx`
- `src/video/templates/StockAnalysis.tsx`
- `src/video/templates/InvestorWarning.tsx`
- `src/video/templates/StockBoxDemo.tsx`
- `src/video/templates/CompanyComparison.tsx`
- `src/video/components/SafeSubtitles.tsx`
- `src/video/components/StockBoxFrame.tsx`
- `src/video/components/GrowthCta.tsx`
- `src/lib/growth/media-qc.ts`
- `scripts/growth/render-growth-video.mjs`
- `scripts/growth/validate-growth-video.mjs`
- `scripts/growth/run-render-worker.mjs`
- `workers/growth-voice/modal_app.py`
- `workers/growth-voice/requirements.txt`
- `workers/growth-voice/README.md`
- `supabase/functions/stockbox-growth-worker-api/index.ts`
- `.github/workflows/growth-render-worker.yml`
- `tests/growth-render-adapter.test.ts`
- `tests/growth-video-template-selection.test.ts`
- `tests/growth-media-qc.test.ts`
- `tests/growth-worker-contract.test.ts`

Modify:
- `package.json`
- `package-lock.json`
- `.github/workflows/growth-quality-ci.yml`

### Task 1: Remotion Render Shell

**Files:** `package.json`, `package-lock.json`, `src/video/Root.tsx`, `src/video/GrowthVideo.tsx`, `src/video/render-adapter.ts`, `tests/growth-render-adapter.test.ts`

**Interfaces:** Consumes `RenderSpec`; produces `toGrowthCompositionProps(spec): GrowthCompositionProps` and composition id `GrowthVideo`.

- [ ] **Step 1: Install one compatible Remotion version across packages**

```bash
npm install remotion @remotion/cli @remotion/renderer
```

- [ ] **Step 2: Write the failing adapter test**

```ts
import { expect, it } from "vitest";
import { toGrowthCompositionProps } from "@/video/render-adapter";

it("derives 30fps vertical composition metadata from final scene", () => {
  const props = toGrowthCompositionProps({
    version: "v3", contentId: "content-1", renderJobId: "job-1", language: "sv",
    template: "educational_checklist", title: "Tre risker", hook: "Tre risker på 30 sekunder",
    script: "Första punkten är skuldsättningen.", voiceMode: "educational",
    scenes: [{ id: "s1", kind: "stockbox_ui", startMs: 0, endMs: 30000, headline: "Risk" }],
    subtitles: [], cta: { text: "Testa StockBox", url: "https://www.getstockbox.app/" },
  });
  expect(props).toMatchObject({ fps: 30, width: 1080, height: 1920, durationInFrames: 900 });
});
```

- [ ] **Step 3: Verify RED**

```bash
npm test -- tests/growth-render-adapter.test.ts
```
Expected: module-not-found failure.

- [ ] **Step 4: Implement adapter and root**

```ts
export type GrowthCompositionProps = {
  spec: RenderSpec;
  fps: 30;
  width: 1080;
  height: 1920;
  durationInFrames: number;
  voiceAudioSrc?: string;
};

export function toGrowthCompositionProps(input: unknown): GrowthCompositionProps {
  const spec = RenderSpecSchema.parse(input);
  const endMs = Math.max(...spec.scenes.map((scene) => scene.endMs));
  return { spec, fps: 30, width: 1080, height: 1920, durationInFrames: Math.ceil(endMs / 1000 * 30) };
}
```

`Root.tsx` registers `GrowthVideo` with metadata calculated from validated input props.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- tests/growth-render-adapter.test.ts
npm run typecheck
git add package.json package-lock.json src/video tests/growth-render-adapter.test.ts
git commit -m "feat: add growth video render shell"
```

### Task 2: Five StockBox-First Templates

**Files:** template/component files listed in the file map, plus `tests/growth-video-template-selection.test.ts`.

**Interfaces:** `selectGrowthTemplate(template)` returns exactly one of the five approved React components; every component consumes `GrowthCompositionProps` only.

- [ ] **Step 1: Write failing selection tests**

```ts
expect(selectGrowthTemplate("educational_checklist").displayName).toBe("EducationalChecklist");
expect(selectGrowthTemplate("stock_analysis").displayName).toBe("StockAnalysis");
expect(selectGrowthTemplate("investor_warning").displayName).toBe("InvestorWarning");
expect(selectGrowthTemplate("stockbox_demo").displayName).toBe("StockBoxDemo");
expect(selectGrowthTemplate("company_comparison").displayName).toBe("CompanyComparison");
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-video-template-selection.test.ts
```

- [ ] **Step 3: Implement shared visual primitives**

`SafeSubtitles` keeps text inside central safe width and above bottom platform controls. `GrowthCta` occupies the final 3-5 seconds. `StockBoxFrame` renders supplied UI/screenshot/chart references and has a built-in branded motion fallback. All animation uses transform/opacity. No template performs DB/network I/O.

- [ ] **Step 4: Implement each template as scene mapping over shared primitives**

```ts
export function selectGrowthTemplate(template: RenderTemplate) {
  return {
    educational_checklist: EducationalChecklist,
    stock_analysis: StockAnalysis,
    investor_warning: InvestorWarning,
    stockbox_demo: StockBoxDemo,
    company_comparison: CompanyComparison,
  }[template];
}
```

Generated media missing from a `generated_micro_scene` renders the scene's declared `motion_graphic` fallback.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- tests/growth-video-template-selection.test.ts tests/growth-render-adapter.test.ts
npm run typecheck
git add src/video tests/growth-video-template-selection.test.ts
git commit -m "feat: add StockBox growth video templates"
```

### Task 3: Render CLI and FFmpeg QC

**Files:** `src/lib/growth/media-qc.ts`, `scripts/growth/render-growth-video.mjs`, `scripts/growth/validate-growth-video.mjs`, `tests/growth-media-qc.test.ts`, `package.json`.

**Interfaces:** `npm run growth:render -- --spec <path> --voice <path> --out <path>`; `npm run growth:qc -- --video <path>`.

- [ ] **Step 1: Write failing QC tests**

Test pass for 1080x1920/H.264/AAC/audio/20-60 seconds and fail for wrong dimensions, missing audio, duration out of range, or terminal-black-frame ratio above threshold.

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-media-qc.test.ts
```

- [ ] **Step 3: Implement the pure QC contract**

```ts
export function evaluateMediaQc(input: {
  width: number; height: number; durationSeconds: number; videoCodec: string;
  audioCodec: string | null; hasAudio: boolean; integratedLufs?: number | null;
  terminalBlackRatio?: number | null;
}): QcSummary {
  const reasons: string[] = [];
  if (input.width !== 1080 || input.height !== 1920) reasons.push("dimensions");
  if (input.durationSeconds < 20 || input.durationSeconds > 60) reasons.push("duration");
  if (!input.hasAudio) reasons.push("missing_audio");
  if (!/h264|avc/i.test(input.videoCodec)) reasons.push("video_codec");
  if (input.audioCodec !== "aac") reasons.push("audio_codec");
  if ((input.terminalBlackRatio ?? 0) > 0.8) reasons.push("terminal_black_frames");
  return { passed: reasons.length === 0, reasons };
}
```

- [ ] **Step 4: Implement CLI sequence**

`render-growth-video.mjs` validates JSON, invokes Remotion renderer, then FFmpeg normalizes audio and encodes final H.264/AAC. `validate-growth-video.mjs` runs `ffprobe -v error -show_streams -show_format -of json`, derives metadata, performs terminal-frame black analysis, and emits only a non-sensitive QC summary.

- [ ] **Step 5: Add scripts and smoke-test an actual file**

```json
{"growth:render":"node scripts/growth/render-growth-video.mjs","growth:qc":"node scripts/growth/validate-growth-video.mjs"}
```

```bash
npm run growth:render -- --spec /tmp/growth-spec.json --voice /tmp/test-voice.wav --out /tmp/growth-smoke.mp4
npm run growth:qc -- --video /tmp/growth-smoke.mp4
```
Expected: QC exit 0, 1080x1920, video+audio streams.

- [ ] **Step 6: Commit**

```bash
git add scripts/growth src/lib/growth/media-qc.ts tests/growth-media-qc.test.ts package.json package-lock.json
git commit -m "feat: render and validate growth videos"
```

### Task 4: Chatterbox-Compatible Swedish Voice Worker on Modal

**Files:** `workers/growth-voice/modal_app.py`, `workers/growth-voice/requirements.txt`, `workers/growth-voice/README.md`.

**Interfaces:** POST JSON `{request_id,text,language:"sv",voice_mode,reference_audio_url}`; bearer token auth; returns WAV bytes or stable JSON error code.

- [ ] **Step 1: Implement strict request validation**

Reject non-Swedish founder-clone requests, text over 1,500 chars, unsupported voice mode, non-HTTPS reference URL, or missing bearer token. Never log the reference URL.

- [ ] **Step 2: Implement one model wrapper with deterministic mode preprocessing**

Use this wrapper shape after pinning/installing the compatible multilingual Chatterbox package in `requirements.txt`:

```py
import io
import torchaudio
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

VOICE_PREFIX = {
    "hook": "",
    "educational": "",
    "serious_analysis": "",
}

_model = None

def get_model():
    global _model
    if _model is None:
        _model = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
    return _model

def synthesize_founder_voice(text: str, reference_path: str, voice_mode: str) -> bytes:
    model = get_model()
    delivery_text = f"{VOICE_PREFIX[voice_mode]}{text}".strip()
    wav = model.generate(delivery_text, language_id="sv", audio_prompt_path=reference_path)
    buffer = io.BytesIO()
    torchaudio.save(buffer, wav.detach().cpu(), model.sr, format="wav")
    return buffer.getvalue()
```

Keep mode differences conservative so speaker identity remains stable; tune prefixes/settings only after listening tests, not by swapping voices.

- [ ] **Step 3: Handle reference audio ephemerally**

Download with <=20s timeout and <=25MB limit into a temporary directory. Delete reference and generated temporary files in `finally`. Never use persistent Modal Volume for founder reference audio.

- [ ] **Step 4: Add `VOICE_WORKER_FAKE=1`**

Fake mode returns a deterministic synthesized test WAV without loading GPU/model; CI must use fake mode only.

- [ ] **Step 5: Document one-time deployment**

README lists secret name `GROWTH_VOICE_WORKER_TOKEN` only, deployment command `modal deploy workers/growth-voice/modal_app.py`, and states that the resulting HTTPS endpoint is stored in secret/config management rather than committed.

- [ ] **Step 6: Commit**

```bash
git add workers/growth-voice
git commit -m "feat: add Swedish growth voice worker"
```

### Task 5: Secure Supabase Worker API

**Files:** `supabase/functions/stockbox-growth-worker-api/index.ts`, `tests/growth-worker-contract.test.ts`.

**Interfaces:** POST `claim`, `complete`, `fail`; auth header `x-stockbox-growth-worker-token`.

- [ ] **Step 1: Write failing contract tests**

Test 401 on bad token; atomic `queued -> storyboarding` claim; QC-failed completion cannot READY; duplicate completion returns same result; retryable failure below max attempts requeues; exhausted/nonretryable failure sets failed.

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/growth-worker-contract.test.ts
```

- [ ] **Step 3: Implement atomic claim RPC path**

Use one DB operation with `FOR UPDATE SKIP LOCKED`, stamping `worker_id`, `claimed_at`, and incremented attempt count. Never SELECT then UPDATE separately.

- [ ] **Step 4: Generate only short-lived signed URLs**

Claim response returns: private voice-reference read URL (default 600s), optional source-asset read URLs, and signed upload URLs for staging WAV/final MP4/cover/metadata. Response uses `Cache-Control: no-store`. Caller never supplies arbitrary bucket/path.

- [ ] **Step 5: Implement completion transaction**

Require `qc.passed=true`, required `master_video`+`cover`, matching content/job path prefix, and checksums. Upsert `acq_media_assets` and mark job ready atomically/idempotently.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- tests/growth-worker-contract.test.ts
git add supabase/functions/stockbox-growth-worker-api tests/growth-worker-contract.test.ts
git commit -m "feat: add secure growth render worker API"
```

### Task 6: Scheduled GitHub Render Worker

**Files:** `.github/workflows/growth-render-worker.yml`, `scripts/growth/run-render-worker.mjs`.

**Interfaces:** cloud-only hourly poll + manual dispatch; at most two jobs/run.

- [ ] **Step 1: Create workflow with concurrency and secrets**

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
        with: {node-version: 22, cache: npm}
      - run: npm ci
      - run: sudo apt-get update && sudo apt-get install -y ffmpeg
      - run: node scripts/growth/run-render-worker.mjs
        env:
          SUPABASE_URL: ${{ secrets.GROWTH_SUPABASE_URL }}
          GROWTH_WORKER_TOKEN: ${{ secrets.GROWTH_WORKER_TOKEN }}
          GROWTH_VOICE_ENDPOINT: ${{ secrets.GROWTH_VOICE_ENDPOINT }}
          GROWTH_VOICE_WORKER_TOKEN: ${{ secrets.GROWTH_VOICE_WORKER_TOKEN }}
```

- [ ] **Step 2: Implement the two-job claim loop**

For each job: claim; exit cleanly if none; fetch validated HTTPS source assets; call voice endpoint; render MP4+cover; QC; upload to signed URLs; send completion with checksums/QC. On failure send stable error code plus retryability. Never echo responses containing signed URLs.

- [ ] **Step 3: Add `GROWTH_WORKER_FAKE=1`**

Fake mode uses local RenderSpec + deterministic WAV and performs a real Remotion/FFmpeg render with no network or paid call.

- [ ] **Step 4: Verify**

```bash
GROWTH_WORKER_FAKE=1 node scripts/growth/run-render-worker.mjs
```
Expected: temporary QC-passing MP4, exit 0.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/growth-render-worker.yml scripts/growth/run-render-worker.mjs
git commit -m "feat: add cloud growth render worker"
```

### Task 7: Dedicated MP4 Smoke Gate

**Files:** `.github/workflows/growth-render-worker.yml`, `.github/workflows/growth-quality-ci.yml`.

- [ ] **Step 1: Add pull-request render-smoke paths**

Include `src/video/**`, `scripts/growth/**`, `src/lib/growth/media-qc.ts`, `src/lib/growth/render-spec.ts`, `workers/growth-voice/**`, and `supabase/functions/stockbox-growth-worker-api/**`.

- [ ] **Step 2: Run deterministic real-file smoke in CI**

```bash
npm ci
sudo apt-get update && sudo apt-get install -y ffmpeg
GROWTH_WORKER_FAKE=1 node scripts/growth/run-render-worker.mjs
```

- [ ] **Step 3: Expand focused unit/type/build CI**

Include `growth-render-adapter`, `growth-video-template-selection`, `growth-media-qc`, and `growth-worker-contract` tests; then run `npm run typecheck` and `npm run build`.

- [ ] **Step 4: Verify logs contain no signed URL/token and commit**

```bash
git add .github/workflows/growth-render-worker.yml .github/workflows/growth-quality-ci.yml
git commit -m "ci: verify autonomous growth video rendering"
```

## Media-factory acceptance gate

Before continuing:
- fake end-to-end worker produces QC-passing 1080x1920 MP4 with audio;
- all five templates share the typed RenderSpec interface;
- generated-scene absence falls back deterministically;
- Swedish voice is isolated behind one authenticated worker;
- founder reference audio uses short-lived private access and ephemeral processing;
- failed QC cannot READY;
- replay cannot duplicate assets;
- GitHub cloud worker runs without founder computer;
- no paid voice request can be created without global budget authorization.
