# StockBox Growth Voice Worker

Private Swedish founder-voice synthesis worker for Growth Engine v3.

## Security invariants

- Founder reference audio is fetched only from short-lived HTTPS Supabase signed URLs.
- The signed URL is never logged or persisted.
- Reference audio lives only in a temporary directory and is deleted after each request.
- Requests require `Authorization: Bearer <token>`.
- The token is stored in Modal secret `stockbox-growth-voice` under key `GROWTH_VOICE_WORKER_TOKEN`.
- Production must never set `VOICE_WORKER_FAKE=1`.

## Request contract

POST JSON:

```json
{
  "request_id": "render-job-id",
  "text": "Swedish narration",
  "language": "sv",
  "voice_mode": "educational",
  "reference_audio_url": "https://...supabase.co/...signed..."
}
```

Allowed `voice_mode` values: `hook`, `educational`, `serious_analysis`.

Success returns `audio/wav`. Errors return stable FastAPI JSON errors such as `unauthorized`, `unsupported_language`, `invalid_reference_host`, or `reference_download_failed`.

## One-time deployment

Install/authenticate Modal locally, create the secret in the Modal dashboard or CLI, then deploy:

```bash
modal deploy workers/growth-voice/modal_app.py
```

Store the resulting HTTPS endpoint in secret/config management for the Growth worker. Do not commit it together with bearer tokens or signed URLs.

## CI fake mode

`VOICE_WORKER_FAKE=1` returns deterministic test WAV data without loading the Chatterbox model. It exists only for contract/smoke tests and is not a fallback voice for production.
