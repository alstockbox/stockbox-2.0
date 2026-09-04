import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const API_URL = process.env.GROWTH_WORKER_API_URL || "";
const API_TOKEN = process.env.GROWTH_RENDER_WORKER_TOKEN || "";
const VOICE_URL = process.env.GROWTH_VOICE_WORKER_URL || "";
const VOICE_TOKEN = process.env.GROWTH_VOICE_WORKER_TOKEN || "";
const VOICE_ESTIMATED_SEK = Number(process.env.GROWTH_VOICE_ESTIMATED_SEK_PER_JOB);
const MAX_JOBS = Math.min(2, Math.max(1, Number(process.env.GROWTH_RENDER_MAX_JOBS || 2)));
const WORKER_ID = `gha-${process.env.GITHUB_RUN_ID || Date.now()}-${process.env.GITHUB_RUN_ATTEMPT || 1}`;

function required(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function workerApi(payload) {
  const response = await fetch(required("GROWTH_WORKER_API_URL", API_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stockbox-growth-worker-token": required("GROWTH_RENDER_WORKER_TOKEN", API_TOKEN),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`worker_api_${response.status}:${data.error || "unknown"}`);
  return data;
}

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command}_failed_${result.status}:${capture ? String(result.stderr || result.stdout).slice(0, 500) : ""}`);
  }
  return capture ? String(result.stdout || "") : "";
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function uploadSigned(target, path, contentType) {
  const body = readFileSync(path);
  const response = await fetch(target.signed_url, {
    method: "PUT",
    headers: {
      "content-type": contentType,
      "cache-control": "max-age=3600",
      "x-upsert": "true",
    },
    body,
  });
  if (!response.ok) throw new Error(`signed_upload_${response.status}:${target.bucket}`);
}

async function synthesizeVoice(job, outputPath) {
  if (job.language !== "sv") throw new Error("english_voice_path_not_implemented");
  required("GROWTH_VOICE_WORKER_URL", VOICE_URL);
  required("GROWTH_VOICE_WORKER_TOKEN", VOICE_TOKEN);
  if (!job.voice_reference_url) throw new Error("founder_voice_reference_missing");
  if (!Number.isFinite(VOICE_ESTIMATED_SEK) || VOICE_ESTIMATED_SEK < 0) {
    throw new Error("GROWTH_VOICE_ESTIMATED_SEK_PER_JOB must be configured");
  }

  const authorization = await workerApi({
    action: "authorize_cost",
    worker_id: WORKER_ID,
    job_id: job.id,
    content_id: job.content_id,
    provider: "modal_chatterbox",
    operation: "founder_voice_tts",
    estimated_sek: VOICE_ESTIMATED_SEK,
    optional: false,
    idempotency_key: `voice:${job.id}:${job.attempt_count}`,
  });

  if (!authorization.authorization?.allowed) {
    const error = new Error(`budget_deferred:${authorization.authorization?.reason || "budget"}`);
    error.code = "BUDGET_DEFERRED";
    throw error;
  }

  const spec = job.render_spec || {};
  const response = await fetch(VOICE_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${VOICE_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      request_id: job.id,
      text: String(spec.script || "").slice(0, 1500),
      language: "sv",
      voice_mode: spec.voiceMode || "educational",
      reference_audio_url: job.voice_reference_url,
    }),
  });
  if (!response.ok) throw new Error(`voice_worker_${response.status}`);
  writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function renderOne(job) {
  const workdir = mkdtempSync(`${tmpdir()}/stockbox-growth-worker-`);
  const specPath = resolve(workdir, "spec.json");
  const voicePath = resolve(workdir, "voice.wav");
  const videoPath = resolve(workdir, "master.mp4");
  const coverPath = resolve(workdir, "cover.jpg");
  const metadataPath = resolve(workdir, "metadata.json");

  try {
    writeFileSync(specPath, JSON.stringify(job.render_spec));
    await synthesizeVoice(job, voicePath);

    run("node", ["scripts/growth/render-growth-video.mjs", "--spec", specPath, "--voice", voicePath, "--out", videoPath]);
    const qcRaw = run("node", ["scripts/growth/validate-growth-video.mjs", "--video", videoPath], true).trim();
    const qc = JSON.parse(qcRaw.split("\n").filter(Boolean).at(-1));
    if (qc.passed !== true) throw new Error(`media_qc_failed:${(qc.reasons || []).join(",")}`);

    run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", "1", "-i", videoPath,
      "-frames:v", "1", "-q:v", "2", coverPath,
    ]);

    writeFileSync(metadataPath, JSON.stringify({
      version: "v3",
      render_job_id: job.id,
      content_id: job.content_id,
      qc,
      generated_at: new Date().toISOString(),
    }));

    await uploadSigned(job.uploads.voice_audio, voicePath, "audio/wav");
    await uploadSigned(job.uploads.master_video, videoPath, "video/mp4");
    await uploadSigned(job.uploads.cover, coverPath, "image/jpeg");
    await uploadSigned(job.uploads.metadata, metadataPath, "application/json");

    const durationMs = Math.round(Number(qc.durationSeconds || 0) * 1000);
    await workerApi({
      action: "complete",
      worker_id: WORKER_ID,
      job_id: job.id,
      qc,
      assets: [
        {
          kind: "voice_audio",
          bucket: job.uploads.voice_audio.bucket,
          storage_path: job.uploads.voice_audio.path,
          mime_type: "audio/wav",
          checksum_sha256: sha256(voicePath),
        },
        {
          kind: "master_video",
          bucket: job.uploads.master_video.bucket,
          storage_path: job.uploads.master_video.path,
          mime_type: "video/mp4",
          width: 1080,
          height: 1920,
          duration_ms: durationMs,
          checksum_sha256: sha256(videoPath),
        },
        {
          kind: "cover",
          bucket: job.uploads.cover.bucket,
          storage_path: job.uploads.cover.path,
          mime_type: "image/jpeg",
          width: 1080,
          height: 1920,
          checksum_sha256: sha256(coverPath),
        },
        {
          kind: "metadata",
          bucket: job.uploads.metadata.bucket,
          storage_path: job.uploads.metadata.path,
          mime_type: "application/json",
          checksum_sha256: sha256(metadataPath),
        },
      ],
    });
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

async function main() {
  let processed = 0;
  for (let index = 0; index < MAX_JOBS; index += 1) {
    const claimed = await workerApi({ action: "claim", worker_id: WORKER_ID });
    const job = claimed.job;
    if (!job) break;

    try {
      await renderOne(job);
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const budgetDeferred = error?.code === "BUDGET_DEFERRED" || message.startsWith("budget_deferred:");
      try {
        await workerApi({
          action: budgetDeferred ? "defer" : "fail",
          worker_id: WORKER_ID,
          job_id: job.id,
          reason: message.slice(0, 900),
          retryable: !budgetDeferred,
        });
      } catch (transitionError) {
        console.error("render_state_transition_failed", transitionError instanceof Error ? transitionError.message : String(transitionError));
      }
      if (!budgetDeferred) throw error;
      break;
    }
  }
  console.log(JSON.stringify({ ok: true, processed }));
}

main().catch((error) => {
  console.error("growth_render_worker_failed", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
