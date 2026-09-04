from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path

import httpx
import modal
from fastapi import Header, HTTPException, Response
from pydantic import BaseModel, Field

from voice_contract import (
    ALLOWED_VOICE_MODES,
    MAX_TEXT_CHARS,
    authorized,
    fake_wav,
    validate_reference_url,
    validate_voice_request,
)

APP_NAME = "stockbox-growth-voice"
MAX_REFERENCE_BYTES = 25 * 1024 * 1024
REFERENCE_TIMEOUT_SECONDS = 20.0

REQUIREMENTS_PATH = str(Path(__file__).with_name("requirements.txt"))
CONTRACT_PATH = Path(__file__).with_name("voice_contract.py")
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements(REQUIREMENTS_PATH)
    .add_local_file(CONTRACT_PATH, remote_path="/root/voice_contract.py")
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


def _synthesize_founder_voice(text: str, reference_path: Path, voice_mode: str) -> bytes:
    import torch
    import torchaudio
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = ChatterboxMultilingualTTS.from_pretrained(device=device)
    wav = model.generate(
        text.strip(),
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
    if not authorized(authorization, os.environ.get("GROWTH_VOICE_WORKER_TOKEN", "")):
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        validate_voice_request(request.language, request.voice_mode, request.text)
        validate_reference_url(request.reference_audio_url)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    if os.environ.get("VOICE_WORKER_FAKE") == "1":
        return Response(
            content=fake_wav(request.text),
            media_type="audio/wav",
            headers={"Cache-Control": "no-store", "X-Voice-Mode": "fake"},
        )

    with tempfile.TemporaryDirectory(prefix="stockbox-growth-voice-") as temp_dir:
        reference_path = Path(temp_dir) / "reference.wav"
        _download_reference(request.reference_audio_url, reference_path)
        try:
            wav_bytes = _synthesize_founder_voice(request.text, reference_path, request.voice_mode)
        finally:
            reference_path.unlink(missing_ok=True)

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store", "X-Voice-Mode": request.voice_mode},
    )
