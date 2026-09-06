from __future__ import annotations

import hmac
import io
import math
from pathlib import PurePosixPath
import wave
from urllib.parse import urlparse

ALLOWED_VOICE_MODES = {"hook", "educational", "serious_analysis", "excited"}
ALLOWED_REFERENCE_AUDIO_SUFFIXES = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac"}
CHATTERBOX_T3_MODEL = "v3"
MAX_TEXT_CHARS = 1500

VOICE_STYLE_PRESETS = {
    "serious_analysis": {
        "default_intensity": 35,
        "exaggeration": (0.32, 0.50),
        "cfg_weight": (0.52, 0.44),
        "temperature": (0.72, 0.78),
    },
    "educational": {
        "default_intensity": 50,
        "exaggeration": (0.42, 0.64),
        "cfg_weight": (0.50, 0.40),
        "temperature": (0.76, 0.82),
    },
    "hook": {
        "default_intensity": 70,
        "exaggeration": (0.54, 0.82),
        "cfg_weight": (0.46, 0.32),
        "temperature": (0.78, 0.86),
    },
    "excited": {
        "default_intensity": 85,
        "exaggeration": (0.68, 0.95),
        "cfg_weight": (0.40, 0.28),
        "temperature": (0.82, 0.90),
    },
}


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


def reference_audio_suffix(raw_url: str) -> str:
    suffix = PurePosixPath(urlparse(raw_url).path).suffix.lower()
    return suffix if suffix in ALLOWED_REFERENCE_AUDIO_SUFFIXES else ".audio"


def chatterbox_model_kwargs() -> dict[str, str]:
    return {"t3_model": CHATTERBOX_T3_MODEL}


def torchaudio_save_kwargs() -> dict[str, str | int]:
    return {"format": "wav", "encoding": "PCM_S", "bits_per_sample": 16}


def _interpolate(bounds: tuple[float, float], ratio: float) -> float:
    low, high = bounds
    return round(low + (high - low) * ratio, 3)


def voice_generation_kwargs(voice_mode: str, style_intensity: int | float | None) -> dict[str, float]:
    preset = VOICE_STYLE_PRESETS.get(voice_mode)
    if preset is None:
        raise ValueError("unsupported_voice_mode")
    if style_intensity is None:
        intensity = float(preset["default_intensity"])
    else:
        if isinstance(style_intensity, bool) or not isinstance(style_intensity, (int, float)):
            raise ValueError("invalid_style_intensity")
        intensity = float(style_intensity)
        if not math.isfinite(intensity) or intensity < 0 or intensity > 100:
            raise ValueError("invalid_style_intensity")
    ratio = intensity / 100.0
    return {
        "exaggeration": _interpolate(preset["exaggeration"], ratio),
        "cfg_weight": _interpolate(preset["cfg_weight"], ratio),
        "temperature": _interpolate(preset["temperature"], ratio),
    }


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
