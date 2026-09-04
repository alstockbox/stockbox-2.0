import { describe, expect, it } from "vitest";
import { evaluateMediaQc } from "../src/lib/growth/media-qc";

const valid = {
  width: 1080,
  height: 1920,
  durationSeconds: 30,
  videoCodec: "h264",
  audioCodec: "aac",
  hasAudio: true,
  integratedLufs: -16,
  terminalBlackRatio: 0.05,
};

describe("growth media QC", () => {
  it("passes a valid vertical H.264/AAC short with audio", () => {
    expect(evaluateMediaQc(valid)).toMatchObject({ passed: true, reasons: [] });
  });

  it("rejects wrong dimensions", () => {
    expect(evaluateMediaQc({ ...valid, width: 1920, height: 1080 })).toMatchObject({
      passed: false,
      reasons: expect.arrayContaining(["dimensions"]),
    });
  });

  it("rejects missing audio", () => {
    expect(evaluateMediaQc({ ...valid, hasAudio: false, audioCodec: null })).toMatchObject({
      passed: false,
      reasons: expect.arrayContaining(["missing_audio"]),
    });
  });

  it("rejects duration outside 20-60 seconds", () => {
    expect(evaluateMediaQc({ ...valid, durationSeconds: 12 })).toMatchObject({
      passed: false,
      reasons: expect.arrayContaining(["duration"]),
    });
    expect(evaluateMediaQc({ ...valid, durationSeconds: 61 })).toMatchObject({
      passed: false,
      reasons: expect.arrayContaining(["duration"]),
    });
  });

  it("rejects wrong codecs or a mostly black terminal sample", () => {
    expect(
      evaluateMediaQc({
        ...valid,
        videoCodec: "vp9",
        audioCodec: "opus",
        terminalBlackRatio: 0.95,
      }),
    ).toMatchObject({
      passed: false,
      reasons: expect.arrayContaining(["video_codec", "audio_codec", "terminal_black_frames"]),
    });
  });
});
