from __future__ import annotations

import io
import math
import os
import tempfile
import wave
from pathlib import Path
from urllib.parse import urlparse

import httpx
import modal
from fastapi import Header, HTTPException, Response
from pydantic import BaseModel, Field

APP_NAME = "stockbox-growth-voice"
MAX_TEXT_CHARS = 1500
MAX_REFERENCE_BYTES = 25 * 1024 * 1024
REFERENCE_TIMEOUT_SECONDS = 20.0
ALLOWED_VOICE_MODES = {"hook", "educational", "serious_analysis"}

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements("/root/requirements.txt")
)

# Modal automatically adds local source files to the image for deployed apps.
# requirements.txt is included explicitly as a small immutable dependency manifest.
image = image.add_local_file(
    Path(__file__).with_name("requirements.txt"),
    remote_path="/root/requirements.txt",
    copy=True,
)

app = modal.App(APP_NAME)
voice_secret = modal.Secret.from_name(
    "stockbox-growth-voice",
    required_keys=["GROWTH_VOICE_WORKER_TOKEN"],
)


class VoiceRequest(BaseModel):
    request_id: str = Field(min_length=1, max_length=160, pattern=r"^[A-Za-z0-9_-]+$")
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)
    language: str
    voice_mode: str
    reference_audio_url: str = Field(min_length=10, max_length=4096)


def _authorized(authorization: str | None) -> bool:
    expected = os.environ.get("GROWTH_VOICE_WORKER_TOKEN", "")
    if not expected or not authorization or not authorization.startswith("Bearer "):
        return False
    supplied = authorization.removeprefix("Bearer ").strip()
    if len(supplied) != len(expected):
        return False
    # Constant-time compare without another dependency.
    import hmac

    return hmac.compare_digest(supplied, expected)


def _validate_reference_url(raw_url: str) -> None:
    parsed = urlparse(raw_url)
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="invalid_reference_url")
    # Founder reference audio is only ever read from a short-lived Supabase
    # signed URL. This also closes the endpoint to generic SSRF targets.
    if not hostname.endswith(".supabase.co"):
        raise HTTPException(status_code=400, detail="invalid_reference_host")


def _download_reference(url: str, destination: Path) -> None:
    total = 0
    with httpx.stream(
        "GET",
        url,
        timeout=httpx.Timeout(REFERENCE_TIMEOUT_SECONDS),
        follow_redirects=False,
    ) as response:
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="reference_download_failed")
        content_length = response.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_REFERENCE_BYTES:
                    raise HTTPException(status_code=413, detail="reference_too_large")
            except ValueError:
                pass
        with destination.open("wb") as handle:
            for chunk in response.iter_bytes(chunk_size=64 * 1024):
                total += len(chunk)
                if total > MAX_REFERENCE_BYTES:
                    raise HTTPException(status_code=413, detail="reference_too_large")
                handle.write(chunk)


def _fake_wav(text: str) -> bytes:
    # Deterministic, valid PCM WAV for CI/contract tests. It intentionally does
    # not imitate the founder's voice and must never be enabled in production.
    sample_rate = 24000
    duration = min(4.0, max(0.8, len(text) / 70.0))
    frame_count = int(sample_rate * duration)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        for index in range(frame_count):
            sample = int(2600 * math.sin(2 * math.pi * 220 * index / sample_rate))
            output.writeframesraw(sample.to_bytes(2, byteorder="little", signed=True))
    return buffer.getvalue()


def _synthesize_founder_voice(text: str, reference_path: Path, voice_mode: str) -> bytes:
    import torch
    import torchaudio
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = ChatterboxMultilingualTTS.from_pretrained(device=device)

    # Keep delivery-mode differences deliberately conservative so speaker
    # identity stays stable. Timing/energy can be tuned after founder listening
    # tests without replacing the voice identity.
    delivery_text = text.strip()
    wav = model.generate(
        delivery_text,
        language_id="sv",
        audio_prompt_path=str(reference_path),
    )
    audio = wav.detach().cpu()
    if audio.ndim == 1:
        audio = audio.unsqueeze(0)
    result = io.BytesIO()
    torchaudio.save(result, audio, model.sr, format="wav")
    return result.getvalue()


@app.function(
    image=image,
    gpu="L4",
    timeout=300,
    scaledown_window=30,
    secrets=[voice_secret],
)
@modal.fastapi_endpoint(method="POST")
def synthesize(
    request: VoiceRequest,
    authorization: str | None = Header(default=None),
):
    if not _authorized(authorization):
        raise HTTPException(status_code=401, detail="unauthorized")
    if request.language != "sv":
        raise HTTPException(status_code=400, detail="unsupported_language")
    if request.voice_mode not in ALLOWED_VOICE_MODES:
        raise HTTPException(status_code=400, detail="unsupported_voice_mode")
    _validate_reference_url(request.reference_audio_url)

    fake_mode = os.environ.get("VOICE_WORKER_FAKE") == "1"
    if fake_mode:
        wav_bytes = _fake_wav(request.text)
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={"Cache-Control": "no-store", "X-Voice-Mode": "fake"},
        )

    with tempfile.TemporaryDirectory(prefix="stockbox-growth-voice-") as temp_dir:
        reference_path = Path(temp_dir) / "reference.wav"
        _download_reference(request.reference_audio_url, reference_path)
        try:
            wav_bytes = _synthesize_founder_voice(
                request.text,
                reference_path,
                request.voice_mode,
            )
        finally:
            # TemporaryDirectory removes all files; explicit unlink keeps the
            # privacy invariant clear even if cleanup behavior changes later.
            reference_path.unlink(missing_ok=True)

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store", "X-Voice-Mode": request.voice_mode},
    )
