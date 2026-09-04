import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { evaluateMediaQc } from "../../src/lib/growth/media-qc.ts";

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

const videoPath = resolve(arg("--video"));
const probe = capture("ffprobe", [
  "-v",
  "error",
  "-show_streams",
  "-show_format",
  "-of",
  "json",
  videoPath,
]);
const metadata = JSON.parse(probe.stdout);
const videoStream = metadata.streams?.find((stream) => stream.codec_type === "video");
const audioStream = metadata.streams?.find((stream) => stream.codec_type === "audio");
const durationSeconds = Number(metadata.format?.duration ?? videoStream?.duration ?? 0);

const sampleSeconds = Math.min(2, Math.max(0.1, durationSeconds));
const black = capture("ffmpeg", [
  "-hide_banner",
  "-sseof",
  `-${sampleSeconds}`,
  "-i",
  videoPath,
  "-an",
  "-vf",
  // Keep this threshold intentionally strict: StockBox's brand background is
  // very dark navy and must not be classified as a terminal black frame.
  // We only want genuinely black / near-black frames to fail QC.
  "blackdetect=d=0.05:pix_th=0.02",
  "-f",
  "null",
  "-",
]);

const durations = [...black.stderr.matchAll(/black_duration:([0-9.]+)/g)].map((match) => Number(match[1]));
const blackSeconds = durations.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
const terminalBlackRatio = Math.min(1, blackSeconds / sampleSeconds);

const qc = evaluateMediaQc({
  width: Number(videoStream?.width ?? 0),
  height: Number(videoStream?.height ?? 0),
  durationSeconds,
  videoCodec: String(videoStream?.codec_name ?? ""),
  audioCodec: audioStream ? String(audioStream.codec_name ?? "") : null,
  hasAudio: Boolean(audioStream),
  terminalBlackRatio,
});

process.stdout.write(
  JSON.stringify({
    passed: qc.passed,
    reasons: qc.reasons,
    width: Number(videoStream?.width ?? 0),
    height: Number(videoStream?.height ?? 0),
    durationSeconds: Number(durationSeconds.toFixed(3)),
    videoCodec: String(videoStream?.codec_name ?? ""),
    audioCodec: audioStream ? String(audioStream.codec_name ?? "") : null,
    terminalBlackRatio: Number(terminalBlackRatio.toFixed(3)),
  }) + "\n",
);

if (!qc.passed) process.exit(2);
