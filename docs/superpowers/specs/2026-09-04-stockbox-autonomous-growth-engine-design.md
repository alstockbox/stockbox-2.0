# StockBox Autonomous Growth Engine v3 — Design

Date: 2026-09-04
Status: Approved design, awaiting implementation plan

## 1. Goal

Build StockBox into a near-autonomous customer-acquisition system whose operating objective is to maximize relevant traffic and downstream customer value while keeping total recurring engine spend at a target of <= 50 SEK/month and an absolute hard ceiling of 75 SEK/month.

The primary traffic target is 100 relevant unique visits/day measured on a rolling 7-day average. This is an optimization target, not a guarantee.

The system must continue to run without the founder's laptop being online. The founder must not be required to appear on camera, record voice, edit video, write captions, create images, or manually assemble assets for the automated channel to function.

## 2. Founder experience

The normal daily workflow must be:

1. Open Growth Control Center.
2. See 0-2 fully rendered priority videos plus any ready image/carousel/text assets.
3. Preview/download ready MP4/JPG/PNG/ZIP assets.
4. Copy platform-specific caption/title/description.
5. Upload/post on the selected social platforms.
6. Mark the package as published.

A separate optional section provides 1-2 founder-recorded video scripts per day. These are bonus content only. Failure to record them must never block the autonomous engine.

The default Growth UI must hide low-level provider errors such as Gemini/RSS timeouts. It should show degraded-but-successful runs as healthy with a compact diagnostic indicator. Detailed provider logs remain available in a diagnostics view.

## 3. Content strategy

### 3.1 Primary language

- Swedish is the default language.
- Swedish automated video uses the founder's cloned voice.
- Occasional English experiments use a generic natural English AI voice.
- English content is exploratory and must not consume budget needed for the Swedish core.

### 3.2 Video style

Primary style: StockBox-first faceless template video.

Typical composition:
- 60-70% StockBox UI/screens/analysis visuals.
- 20-30% motion graphics, large numbers, animated labels, simple charts and subtitles.
- 0-15% optional generated/B-roll-style micro-scenes where they add meaning.

Generated video is never a hard dependency. If a generative clip is unavailable, slow, over budget, or fails QC, the slot is replaced automatically by StockBox UI or motion graphics.

### 3.3 Distribution reuse

One master vertical 9:16 MP4 is optimized primarily for Instagram Reels and Facebook Reels, then reused on TikTok and YouTube Shorts.

Each platform receives separate copy and attribution:
- Instagram caption + UTM URL
- Facebook caption + UTM URL
- TikTok caption + UTM URL
- YouTube title + description + UTM URL

The video binary may be shared; the distribution package may not.

## 4. Daily autonomous loop

The daily orchestrator runs in the cloud and performs:

1. COLLECT — ingest prior performance and attribution.
2. LEARN — update topic, hook, template and channel performance.
3. ALLOCATE — choose today's effort using budget and expected value.
4. DISCOVER — find evergreen/news/opportunity candidates.
5. SCORE — enforce StockBox relevance and quality thresholds.
6. SELECT — choose a small diversified shortlist.
7. WRITE — create content/master scripts with AI plus deterministic fallback.
8. STORYBOARD — map script to timed scenes and visual slots.
9. VOICE — synthesize Swedish founder-clone voice or English generic voice.
10. RENDER — generate the master 1080x1920 MP4, subtitles and cover.
11. QC — validate technical and content quality.
12. PACKAGE — generate per-platform copy/assets/UTMs.
13. READY — publish the final package into Growth Control Center.
14. OPTIONAL SCRIPT IDEAS — generate 1-2 founder-recorded script ideas independently.
15. REPORT — explain what the engine learned and why today's assets were chosen.

No provider failure may terminate the entire daily loop when a safe deterministic/template fallback exists.

## 5. Explore/exploit policy

Initial allocation policy:
- 70% exploit: topics/formats/channels with strong measured traffic or downstream conversion.
- 20% explore: new hooks, topics, lengths, CTAs, formats and English experiments.
- 10% long-shot/diversification: cheap ideas that currently underperform but remain strategically useful to retest.

Weak channels should normally be down-weighted, not permanently killed, unless they are unsafe, unsupported or materially waste budget.

The system optimizes for useful traffic rather than raw views. As enough data accumulates, ranking should increasingly use downstream events such as signup, first analysis and paid conversion.

## 6. Scoring and measurement

Every asset and platform distribution receives a stable content/package ID and tracked UTM parameters.

Core metrics:
- qualified unique visits
- rolling 7-day qualified-visit average
- visits per 1,000 impressions when impression data is available
- click-through rate
- signup conversion
- activation / first-analysis conversion
- paid conversion when enough data exists
- cost per visit / cost per activated user
- engagement signals such as saves, watch time and shares when available

A Growth Score should be configurable rather than hard-coded. Initial weights may emphasize traffic and CTR while the user base is small; later weights should shift toward activation and revenue quality.

## 7. Budget Governor

The engine gets one global budget ledger across all paid growth-AI usage.

Limits:
- target operating budget: 50 SEK/month
- soft warning/projection threshold: configurable below 50 SEK
- absolute hard ceiling: 75 SEK/month

The governor must include:
- LLM/token spend
- voice inference compute
- paid generative media
- any other metered API added to the growth engine

Free compute/credits are recorded with zero billable cost but may still track estimated resource usage.

Budget decisions:
- healthy budget: permit 0-2 automatic master videos/day based on expected value
- rising spend: reduce generative scenes first
- higher spend: reduce 2 videos to 1
- near ceiling: use only free/template/deterministic paths
- at hard ceiling: refuse all optional paid calls until next monthly budget period

The governor must fail closed on unknown chargeable requests: a provider call whose cost cannot be bounded must not be made automatically.

## 8. Voice architecture

Preferred Swedish voice path:
- private founder reference audio stored in Supabase Storage
- voice-clone inference through an external isolated inference worker
- preferred initial model: Chatterbox Multilingual V3 or a compatible provider behind the same interface
- preferred initial compute: serverless GPU such as Modal, subject to implementation benchmarking and privacy review

The system must use a provider abstraction so the voice model or host can be replaced without rewriting the growth engine.

Voice modes derived from the same founder identity:
- hook: higher energy and faster opening cadence
- educational: natural, clear and conversational
- serious analysis: calmer and more analytical

Voice reference storage requirements:
- private bucket only
- service-role/admin access only
- short-lived signed access when a render worker needs audio
- no reference audio in the public GitHub repository
- no public asset URL
- delete temporary worker copies after inference

English content uses a separate generic voice provider/profile and never clones the founder in English unless explicitly enabled later.

## 9. Rendering architecture

Rendering is template-based rather than full generative video.

Preferred implementation:
- Remotion for deterministic timeline/layout composition
- FFmpeg for final encoding, audio normalization, muxing and validation
- cloud render worker triggered automatically; GitHub Actions is the preferred initial worker because the repository already uses GitHub and does not require the founder's machine

Render templates:
- Educational checklist
- Stock analysis
- Investor mistake / warning
- StockBox demo
- Company comparison

Each template accepts a typed RenderSpec containing:
- content ID
- title/hook
- script
- timed voice track
- scene list
- StockBox screenshot/UI asset references
- chart/stat assets
- optional generative scene references
- subtitle cues
- CTA
- brand metadata

Master output target:
- MP4
- 1080x1920
- H.264 video + AAC audio unless platform tests require another profile
- duration normally 20-60 seconds
- safe-zone-aware subtitles and CTA
- no watermark

## 10. Optional generative scene slot

The video factory may include short generated visual scenes when budget allows and the scene improves comprehension or retention.

Rules:
- generative video is an enhancement, never the base renderer
- use short clips rather than full generated videos
- budget governor authorizes every paid generation
- generated scenes receive QC before inclusion
- failure automatically falls back to StockBox UI/motion graphics

The system should aim to test generative micro-scenes regularly, but may produce zero on a day where cost, provider availability or quality makes them irrational.

## 11. Screenshot/UI visual source

StockBox-first videos need a deterministic source of StockBox visuals.

The rendering subsystem should support:
- curated reusable branded UI frames
- automatically captured product screenshots from controlled routes where practical
- generated charts/figures from structured StockBox data
- motion graphics built from typed scene data

No render should depend on fragile manual screen recording.

## 12. Quality control

A package may only enter READY when it passes both technical and content QC.

Technical QC:
- output exists and is decodable
- 1080x1920 for video
- duration within configured range
- audio track exists
- loudness within configured range
- subtitles are present when required and inside safe zones
- no empty/black terminal frames above tolerance
- file size within platform-safe bounds
- cover exists

Content QC:
- StockBox relevance above threshold
- title/script/caption refer to the same topic/content ID
- no duplicate tracked URL in final platform copy
- CTA present where required
- no stale ticker/company leakage from another content item
- no obvious duplicated paragraphs
- claims derived from StockBox data are internally consistent with provided structured input

QC failure flow:
1. retry/rerender once when deterministic repair is possible
2. fall back to simpler template/provider
3. if still invalid, mark failed and replace with another candidate if capacity remains

A failed asset must never appear in the founder's READY queue.

## 13. Asset storage

Private Supabase Storage buckets should separate sensitive and distributable assets.

Recommended logical buckets:
- growth-voice-private — founder reference audio and voice profile artifacts
- growth-render-staging — temporary audio/scenes/render intermediates
- growth-ready-assets — final MP4, covers, carousel slides and ZIP packages

Logical package layout:

YYYY-MM-DD/<content-id>/
- master.mp4
- cover.jpg
- instagram.txt
- facebook.txt
- tiktok.txt
- youtube.txt
- carousel/slide-01.png ...
- metadata.json

Actual paths may use IDs rather than human-readable titles.

Retention:
- voice reference retained until explicitly replaced/deleted
- render staging cleaned automatically
- ready assets retained for a configurable period and/or while linked to a published package

## 14. Data model additions

Reuse existing acq_* tables where possible. Add focused units rather than overloading acq_distribution_queue.

Recommended additions:

### acq_voice_profiles
Stores profile metadata only, including language, provider/model, private storage path, status, consent timestamp and version.

### acq_render_jobs
One row per rendering lifecycle with content_id, template, state, provider/worker, attempts, timestamps and failure reason.

States: queued, voicing, storyboarding, rendering, qc, ready, failed, superseded.

### acq_media_assets
Typed asset registry for voice audio, screenshots, generated scenes, master MP4, cover, carousel slide and ZIP package. Stores private storage path, content ID, mime type, dimensions/duration, checksum and QC state.

### acq_distribution_packages
Platform-specific package tied to one master asset. Stores platform, caption/title/description, UTM URL, recommended time, package status and publication metadata.

### acq_budget_ledger
Append-only normalized spend/usage ledger with provider, operation, content ID, estimated SEK, actual SEK when known, currency/original amount, timestamp and billing period.

### acq_manual_script_ideas
The optional 1-2 founder-recorded scripts/day, independent from automatic render jobs.

Existing acq_ai_usage may remain as raw model telemetry, but Budget Governor decisions should read the normalized budget ledger.

## 15. Orchestration and cloud execution

Supabase remains the control plane:
- schedules daily orchestration
- stores config/state/metrics
- holds private asset metadata and storage
- dispatches render work
- receives worker completion callbacks

Rendering/voice workers must be idempotent. Replaying the same job must not create duplicate READY packages.

Worker authentication:
- signed service token/secrets stored only in provider secret stores
- no long-lived secret rendered into client code
- callback verifies job ID + signature

The founder's laptop is not part of the production architecture.

## 16. Growth Control Center v3

Default view must prioritize action and learning, not infrastructure.

Top summary:
- qualified visits today
- rolling 7-day average
- target 100/day
- change vs prior 7 days
- monthly budget used / target / hard ceiling

READY card:
- rank
- platform group
- title/topic
- video preview
- Download MP4
- Download cover
- Copy Instagram caption
- Copy Facebook caption
- Copy TikTok caption
- Copy YouTube title + description
- recommended publication time
- Mark published
- Skip/defer

Separate sections:
- optional founder scripts
- image/carousel packages
- creator outreach
- SEO status
- compact "what the engine learned" report
- diagnostics, collapsed by default

Provider 503/timeouts that successfully fall back must not be presented as top-level red system failures.

## 17. Ready-to-post vs auto-post

v3 first milestone is READY-TO-POST, not mandatory social auto-publishing.

A package is complete when the founder can upload the provided asset and paste the provided copy without editing or recording anything.

The architecture should permit future official API-based autopublishing channel-by-channel, but social API credentials and permissions must not block v3.

## 18. Failure and fallback hierarchy

LLM failure -> retry bounded times -> deterministic content fallback.

RSS/news failure -> evergreen discovery continues.

Voice provider failure -> retry -> alternate compatible voice worker/provider; if Swedish founder-clone is unavailable and no approved clone fallback exists, do not silently substitute a different Swedish identity. Defer that video or use non-voice content.

Generative scene failure -> motion-graphics/template scene.

Render worker failure -> retry idempotently -> simpler template -> replacement candidate.

Storage/upload failure -> never mark READY.

Budget uncertainty -> skip paid operation.

## 19. Security and privacy

- Founder voice source is sensitive private media and must never enter the public repository.
- Supabase service role remains server-side only.
- Signed asset links should be short-lived.
- External providers receive only the minimum data needed for the operation.
- Logs must not include signed URLs, raw reference audio, secrets or full provider credentials.
- All externally supplied/generated text is treated as data, never executable instructions.

## 20. Testing strategy

Unit tests:
- budget governor decisions
- package/UTM construction
- platform copy de-duplication
- explore/exploit allocation
- QC rules
- render spec validation
- provider fallback selection

Integration tests:
- content -> storyboard -> voice stub -> render stub -> QC -> READY
- provider failure -> fallback -> READY
- hard budget ceiling blocks paid calls
- idempotent job replay does not duplicate assets/packages
- storage callback security

Render smoke tests:
- actual short MP4 render in CI
- ffprobe validates dimensions/codecs/duration/audio
- subtitle safe-zone snapshot/visual regression where practical

Production canary:
- first automated render path can run in shadow mode before it is allowed into READY
- only after QC and budget telemetry are verified does it become the default automatic path

## 21. Acceptance criteria

The architecture is considered implemented when all of the following are true:

1. A scheduled cloud run can produce a complete Swedish faceless StockBox video without founder intervention.
2. The final output includes a playable 1080x1920 MP4, voiceover, subtitles, cover, CTA and platform packages.
3. The founder does not need to record, edit or assemble the automatic video.
4. The same master MP4 can be distributed to Instagram/Facebook/TikTok/YouTube with platform-specific copy and UTMs.
5. The system chooses 0-2 automatic master videos/day based on expected value and budget.
6. It independently produces 1-2 optional founder-recorded scripts/day.
7. Generated visual micro-scenes are optional and have a deterministic fallback.
8. Provider timeouts/failures do not break the daily engine where a fallback exists.
9. Monthly total paid growth-engine spend is governed toward <= 50 SEK and cannot intentionally exceed 75 SEK.
10. Voice reference media remains private and outside GitHub.
11. Only QC-passing assets are exposed as READY.
12. Growth Control Center gives a simple preview/download/copy/published workflow.
13. Performance signals feed the next day's explore/exploit allocation.
14. The system can run while the founder's computer is off.

## 22. Explicit non-goals for this implementation

- Guaranteeing 100 visits/day.
- Requiring the founder to appear on camera.
- Requiring the founder to record daily voice.
- Full cinematic text-to-video generation for every scene.
- Mandatory automatic posting to every social network in v3.
- Building an expensive ad-buying system.
- Replacing StockBox's existing analysis engine.

## 23. Recommended implementation boundaries

Implement as isolated modules with typed interfaces:

- growth/orchestrator
- growth/allocation
- growth/budget
- growth/voice
- growth/storyboard
- growth/render-spec
- growth/providers
- growth/qc
- growth/packages
- growth/metrics
- growth/manual-scripts

The existing StockBox growth engine remains the discovery/content/performance control plane. v3 extends it with media production and better decisioning rather than rewriting unrelated StockBox systems.
