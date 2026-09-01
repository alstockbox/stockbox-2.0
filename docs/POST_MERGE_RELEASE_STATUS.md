# StockBox post-merge release status

Recorded: 2026-09-01

- Release-hardening PR #3 was merged into `main`.
- Merge commit: `96f8b13d250b7b0a3f03a01638b7f9a2a2b1f5d9`.
- Final pre-merge release gate passed 1,404/1,404 tests, typecheck, lint, production build, live public market-provider smoke, live ECB FX smoke, production server startup and runtime/security smoke.
- Production Supabase Defensive-profile migration is applied as version `20260831215457`.
- Supabase Leaked Password Protection remains plan-blocked on the current project tier.
- This post-merge documentation commit intentionally provides a fresh `main` Git event so the linked Vercel project can attempt deployment of the merged release when build capacity is available.
