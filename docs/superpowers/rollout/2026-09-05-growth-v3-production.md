# StockBox Growth Engine v3 — production rollout

Date: 2026-09-05

## Current production state

- Autonomous Growth Engine v3 code is merged into `main`.
- Supabase v3 schema/migrations are deployed additively; the v2 acquisition engine remains intact.
- `growth_render_shadow_mode=true` and `growth_v3_shadow_mode=true` remain fail-closed.
- Monthly growth spend target is 50 SEK and the intentional hard cap is 75 SEK.
- `growth-voice-private`, `growth-render-staging`, and `growth-ready-assets` are private buckets.
- `stockbox-growth-engine-v3` and `stockbox-growth-worker-api` are deployed as isolated Edge Functions.
- The v3 status canary is healthy in shadow mode.
- The render worker remains intentionally non-operational until its private worker token and real founder-voice provider are configured and the real voice/render canary passes.
- No v3 video distribution package may be promoted to READY while shadow mode is enabled.

## Promotion gate

Do not set `growth_render_shadow_mode=false` until a real Swedish founder voice sample has passed synthesis review and a full MP4 render has passed QC, provider-cost accounting, storage checks, and four-platform package verification.
