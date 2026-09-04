export type MediaQcInput = {
  width: number;
  height: number;
  durationSeconds: number;
  videoCodec: string;
  audioCodec: string | null;
  hasAudio: boolean;
  integratedLufs?: number | null;
  terminalBlackRatio?: number | null;
};

export type MediaQcResult = {
  passed: boolean;
  reasons: string[];
};

export function evaluateMediaQc(input: MediaQcInput): MediaQcResult {
  const reasons: string[] = [];

  if (input.width !== 1080 || input.height !== 1920) reasons.push("dimensions");
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 20 || input.durationSeconds > 60) {
    reasons.push("duration");
  }
  if (!input.hasAudio) reasons.push("missing_audio");
  if (!/h264|avc/i.test(input.videoCodec)) reasons.push("video_codec");
  if ((input.audioCodec ?? "").toLowerCase() !== "aac") reasons.push("audio_codec");
  if ((input.terminalBlackRatio ?? 0) > 0.8) reasons.push("terminal_black_frames");

  return { passed: reasons.length === 0, reasons };
}
