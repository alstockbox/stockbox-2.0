# StockBox Autonomous Growth Engine v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved autonomous StockBox ready-to-post customer-acquisition engine in reviewable, independently testable subsystem increments.

**Architecture:** The approved design spans several independent subsystems, so implementation is deliberately split into six ordered plans rather than one unsafe mega-change. Supabase stays the durable control plane, pure TypeScript policy remains separately testable, GitHub Actions/Remotion/FFmpeg provide cloud media rendering, private storage protects voice/media, and Growth Control Center exposes only QC-passing final assets.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Vitest 4, Zod 4, Supabase Postgres/Storage/Edge Functions, Remotion, FFmpeg/ffprobe, GitHub Actions, Python/Modal-compatible voice inference.

**Spec:** `docs/superpowers/specs/2026-09-04-stockbox-autonomous-growth-engine-design.md`

## Global Constraints

- Optimization target: 100 relevant unique visits/day on rolling 7-day average; not guaranteed.
- Total recurring engine-spend target <= 50 SEK/month; absolute hard cap 75 SEK/month.
- Automatic output is 0-2 master videos/day based on quality, expected value, and budget.
- Swedish is primary; Swedish automatic videos use the approved founder voice clone.
- English is occasional experimental content using a generic natural AI voice.
- Founder is not required to appear, record daily voice, edit, create images, or assemble automatic content.
- One vertical master MP4 is optimized for Instagram/Facebook Reels and reused on TikTok/YouTube Shorts with distinct platform copy/UTMs.
- 1-2 founder-recorded script ideas/day are optional bonus output and never block automation.
- Provider failures use bounded retries and approved fallbacks; failed/QC-invalid assets never become READY.
- Founder voice reference audio remains private and outside GitHub.
- v2 acquisition, including existing SEO and creator-outreach paths, remains operational throughout v3 shadow/canary rollout.

---

## Why this is split into six plans

The approved specification contains independent data/budget, media rendering, visual assets, provider/privacy/retention integration, growth intelligence, and founder UI/rollout subsystems. Each plan below ends in software that can be tested and reviewed without requiring the next plan to be complete. Execute them in order because later plans consume interfaces created earlier.

### Plan 1 — Foundation and global budget

Path: `docs/superpowers/plans/2026-09-04-growth-engine-foundation-and-budget.md`

Delivers:
- global 50/75 SEK budget governor;
- normalized budget ledger;
- typed RenderSpec/media/package contracts;
- deterministic private storage paths;
- six durable v3 growth tables;
- three private Storage buckets;
- shadow-mode config;
- expanded focused CI.

Gate: no production rendering yet; v2 remains untouched.

- [ ] Execute every task in Plan 1 and pass its foundation acceptance gate.

### Plan 2 — Cloud media factory and cloned voice

Path: `docs/superpowers/plans/2026-09-04-growth-media-factory.md`

Delivers:
- Remotion render shell and five StockBox-first templates;
- FFmpeg/ffprobe QC;
- Swedish Chatterbox-compatible voice worker behind authenticated provider interface;
- secure worker claim/signed-upload/completion API;
- scheduled GitHub render worker;
- real deterministic MP4 smoke in CI.

Gate: fake/local/cloud canary can produce a QC-passing 1080x1920 MP4 with audio without the founder computer.

- [ ] Execute every task in Plan 2 and pass its media-factory acceptance gate.

### Plan 3 — Finished visual assets and optional generative scenes

Path: `docs/superpowers/plans/2026-09-04-growth-visual-assets-and-generative-scenes.md`

Delivers:
- final 1080x1350 carousel PNG slides + cover + ZIP;
- final static StockBox images;
- cost-aware generative micro-scene provider contract;
- mandatory provider cost/quality benchmark before enablement;
- automatic motion-graphics fallback;
- explicit `video | carousel | static_image` job kinds;
- worker support for video/carousel/static jobs.

Gate: all deterministic visual formats are ready-to-post; optional generated scenes can never block production or cross budget policy.

- [ ] Execute every task in Plan 3 and pass its visual-assets acceptance gate.

### Plan 4 — Provider, retention, and visual-source hardening

Path: `docs/superpowers/plans/2026-09-04-growth-provider-retention-and-visual-source-hardening.md`

Delivers:
- render-job-kind contract verification across producers and worker;
- distinct Swedish founder-clone and generic English voice paths;
- deterministic StockBox structured/curated/captured/motion-fallback visual source selection;
- idempotent voice/generative spend accounting;
- staging cleanup and ready-asset retention;
- regression protection for existing SEO and creator-outreach workflows.

Gate: cross-cutting provider/privacy/storage behavior is explicit, measurable, budgeted, and does not regress current acquisition channels.

- [ ] Execute every task in Plan 4 and pass its hardening acceptance gate.

### Plan 5 — Growth intelligence and daily orchestration

Path: `docs/superpowers/plans/2026-09-04-growth-intelligence-and-orchestration.md`

Delivers:
- 70/20/10 exploit/explore/long-shot allocator;
- configurable Growth Score using traffic/downstream value;
- deterministic storyboard builder;
- 0-2 daily automatic render-job selection;
- global-budget retrofit of existing Gemini usage;
- v3 shadow job enqueue while preserving v2;
- 1-2 optional founder scripts/day;
- learning fed into next-day allocation and founder brief.

Gate: a shadow full run learns, allocates, enqueues idempotently, respects budget, and leaves v2 production intact.

- [ ] Execute every task in Plan 5 and pass its orchestration acceptance gate.

### Plan 6 — Growth Control Center v3 and production rollout

Path: `docs/superpowers/plans/2026-09-04-growth-control-center-and-rollout.md`

Delivers:
- founder-facing READY dashboard;
- private authenticated MP4/cover/carousel access;
- separate Instagram/Facebook/TikTok/YouTube copy packages;
- optional founder scripts section;
- recovered provider failures hidden from top-level alarm UI;
- one-time private voice-profile upload/test/activation flow;
- shadow-to-one-video-canary-to-0-2 production promotion;
- final acceptance/security verification.

Gate: actual production canary is rendered, QC-passed, privately served, ready to post, budget-observed, and production frontend deployment is independently verified.

- [ ] Execute every task in Plan 6 and pass its rollout acceptance gate.

## Cross-plan review checkpoints

- [ ] After Plan 1: review schema/security/budget before creating any external-worker integration.
- [ ] After Plan 2: review a deterministic rendered MP4 and worker logs for secret leakage before adding generative media.
- [ ] After Plan 3: verify deterministic carousel/static output and benchmark any real generative provider before enablement.
- [ ] After Plan 4: verify English voice isolation, visual fallbacks, spend accounting, retention, SEO, and creator outreach before orchestration consumes them.
- [ ] After Plan 5: run v3 entirely in shadow mode and compare against current v2 behavior/traffic pipeline.
- [ ] After Plan 6 one-video canary: verify actual voice quality, spend, storage privacy, QC, and live UI before allowing max 2/day.

## Required one-time founder actions during implementation

Only request these when the corresponding implementation is ready:
1. Upload 5-10 minutes of clean Swedish voice reference through the private admin voice page.
2. Listen to one private synthesized voice test and approve/activate it.
3. If the chosen cloud voice/generative provider requires an account/API credential that cannot be provisioned programmatically, configure that secret once through the provider/Supabase/GitHub secret UI. Never ask the founder to paste secrets into chat.

No recurring filming, voice recording, editing, caption writing, image creation, or local computer runtime is part of the automated production requirement.

## Plan self-review

Before execution, the plans were checked against the approved design for budget limits, 0-2 automatic videos, optional founder scripts, Swedish/English voice separation, finished MP4/carousel/static assets, generative fallback, private voice/media storage, spend accounting, retention, existing SEO/outreach preservation, shadow rollout, and production deployment verification. Cross-cutting gaps found during review were moved into the explicit hardening plan rather than left implicit.

## Final program acceptance

The full v3 program is complete only after all six plan gates pass and the 14 acceptance criteria in the approved design spec have recorded evidence. Software completion must be reported separately from actual acquisition performance: reaching 100 relevant visits/day remains the engine's optimization objective and is measured after rollout, not a promise made by the implementation.
