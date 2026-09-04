from __future__ import annotations

import hmac
import io
import math
import wave
from urllib.parse import urlparse

ALLOWED_VOICE_MODES = {"hook", "educational", "serious_analysis"}
MAX_TEXT_CHARS = 1500


def authorized(authorization: str | None, expected: str) -> bool:
    if not expected or not authorization or not authorization.startswith("Bearer "):
        return False
    supplied = authorization.removeprefix("Bearer ").strip()
    return bool(supplied) and hmac.compare_digest(supplied, expected)


def validate_reference_url(raw_url: str) -> None:
    parsed = urlparse(raw_url)
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not hostname or parsed.username or parsed.password:
        raise ValueError("invalid_reference_url")
    if not hostname.endswith(".supabase.co"):
        raise ValueError("invalid_reference_host")


def validate_voice_request(language: str, voice_mode: str, text: str) -> None:
    if language != "sv":
        raise ValueError("unsupported_language")
    if voice_mode not in ALLOWED_VOICE_MODES:
        raise ValueError("unsupported_voice_mode")
    if not text.strip() or len(text) > MAX_TEXT_CHARS:
        raise ValueError("invalid_text")


def fake_wav(text: str) -> bytes:
    """Deterministic CI-only PCM WAV. It never imitates the founder."""
    sample_rate = 24000
    duration = min(4.0, max(0.8, len(text) / 70.0))
    frame_count = int(sample_rate * duration)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        frames = bytearray()
        for index in range(frame_count):
            sample = int(2600 * math.sin(2 * math.pi * 220 * index / sample_rate))
            frames.extend(sample.to_bytes(2, byteorder="little", signed=True))
        output.writeframes(bytes(frames))
    return buffer.getvalue()
