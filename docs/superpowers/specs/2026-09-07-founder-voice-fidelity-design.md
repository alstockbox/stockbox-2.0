# Founder voice fidelity redesign

## Goal
Replace the current Chatterbox founder-voice synthesis path with VoxCPM2 while preserving the existing Growth Engine render, budget, shadow-mode and storage architecture.

## Success criteria
- Swedish voice must preserve the founder's real identity and regional Swedish speech characteristics rather than applying a generic or foreign-sounding accent.
- Default delivery should sound like the founder, only clearer, more confident and more persuasive.
- Delivery style (`serious_analysis`, `educational`, `hook`, `excited`) may change prosody, but must not change speaker identity, dialect or pitch range materially.
- No paid provider call is allowed without fresh explicit approval.
- Chatterbox stays available only as a disabled historical/testing candidate; it is not activated.

## Architecture
The Growth Engine keeps its current HTTP voice contract and budget gate. A new VoxCPM2 worker is introduced behind the same endpoint contract rather than changing rendering or distribution code.

For Swedish founder voice, the worker uses VoxCPM2 Ultimate Cloning when an exact reference transcript is present: the same reference clip is supplied as both `reference_wav_path` and `prompt_wav_path`, together with `prompt_text`. Style control is kept separate from identity. The reference audio and transcript define identity; delivery presets only influence confidence, pace and expressiveness.

The active voice profile stores the reference audio path plus an exact transcript in metadata. The worker API passes the transcript to the render worker without exposing private storage credentials. If transcript or active profile is missing, synthesis fails closed.

## Safety and rollout
The existing 75 SEK hard cap, 50 SEK target, shadow modes and explicit paid-call approval remain unchanged. The VoxCPM2 profile remains `testing` until subjective approval. No automatic activation, release or production flag change is part of this work.

## Validation
TDD covers the request contract, required reference transcript, provider identity, style mapping, fail-closed behavior and unchanged English/generative gates. A zero-cost acoustic baseline compares founder recordings against generated candidates. Subjective approval remains the final gate for voice identity.
