from __future__ import annotations

import io
import unittest
import wave

from voice_contract import (
    authorized,
    chatterbox_model_kwargs,
    fake_wav,
    reference_audio_suffix,
    torchaudio_save_kwargs,
    validate_reference_url,
    validate_voice_request,
    voice_generation_kwargs,
)


class VoiceContractTests(unittest.TestCase):
    def test_bearer_auth_is_exact(self):
        self.assertTrue(authorized("Bearer secret", "secret"))
        self.assertFalse(authorized("Bearer wrong", "secret"))
        self.assertFalse(authorized(None, "secret"))

    def test_reference_url_is_supabase_https_only(self):
        validate_reference_url("https://abc.supabase.co/storage/v1/object/sign/x")
        with self.assertRaisesRegex(ValueError, "invalid_reference_host"):
            validate_reference_url("https://example.com/reference.wav")
        with self.assertRaisesRegex(ValueError, "invalid_reference_url"):
            validate_reference_url("http://abc.supabase.co/reference.wav")

    def test_founder_clone_contract_is_swedish_and_bounded(self):
        validate_voice_request("sv", "educational", "Hej")
        validate_voice_request("sv", "excited", "Hej")
        with self.assertRaisesRegex(ValueError, "unsupported_language"):
            validate_voice_request("en", "educational", "Hello")
        with self.assertRaisesRegex(ValueError, "unsupported_voice_mode"):
            validate_voice_request("sv", "unknown", "Hej")
        with self.assertRaisesRegex(ValueError, "invalid_text"):
            validate_voice_request("sv", "hook", "x" * 1501)

    def test_founder_model_is_explicitly_multilingual_v3(self):
        self.assertEqual(chatterbox_model_kwargs(), {"t3_model": "v3"})

    def test_reference_audio_suffix_preserves_supported_audio_type(self):
        self.assertEqual(
            reference_audio_suffix(
                "https://abc.supabase.co/storage/v1/object/sign/growth-voice-private/founder-voice-sv-v1.mp3?token=secret"
            ),
            ".mp3",
        )
        self.assertEqual(
            reference_audio_suffix(
                "https://abc.supabase.co/storage/v1/object/sign/growth-voice-private/reference.bin?token=secret"
            ),
            ".audio",
        )

    def test_real_voice_output_is_standard_pcm16_wav(self):
        self.assertEqual(
            torchaudio_save_kwargs(),
            {"format": "wav", "encoding": "PCM_S", "bits_per_sample": 16},
        )

    def test_voice_style_defaults_are_deterministic(self):
        self.assertEqual(
            voice_generation_kwargs("educational", None),
            {"exaggeration": 0.53, "cfg_weight": 0.45, "temperature": 0.79},
        )
        self.assertEqual(
            voice_generation_kwargs("excited", None),
            {"exaggeration": 0.91, "cfg_weight": 0.298, "temperature": 0.888},
        )

    def test_voice_style_intensity_changes_delivery_within_safe_bounds(self):
        low = voice_generation_kwargs("hook", 0)
        high = voice_generation_kwargs("hook", 100)
        self.assertLess(low["exaggeration"], high["exaggeration"])
        self.assertGreater(low["cfg_weight"], high["cfg_weight"])
        self.assertLess(low["temperature"], high["temperature"])
        self.assertEqual(low, {"exaggeration": 0.54, "cfg_weight": 0.46, "temperature": 0.78})
        self.assertEqual(high, {"exaggeration": 0.82, "cfg_weight": 0.32, "temperature": 0.86})

    def test_voice_style_intensity_rejects_out_of_range_values(self):
        for value in (-1, 101, True):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "invalid_style_intensity"):
                voice_generation_kwargs("educational", value)

    def test_fake_mode_wav_is_deterministic_and_valid(self):
        first = fake_wav("Test")
        second = fake_wav("Test")
        self.assertEqual(first, second)
        with wave.open(io.BytesIO(first), "rb") as audio:
            self.assertEqual(audio.getnchannels(), 1)
            self.assertEqual(audio.getframerate(), 24000)
            self.assertGreater(audio.getnframes(), 0)


if __name__ == "__main__":
    unittest.main()
