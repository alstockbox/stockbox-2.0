import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

export function validateGenerativeRequest(request) {
  const durationSeconds = Number(request?.durationSeconds);
  if (!Number.isInteger(durationSeconds) || durationSeconds < 2 || durationSeconds > 5) {
    throw new Error("generative_duration_must_be_2_to_5_seconds");
  }
  if (request?.aspectRatio !== "9:16") throw new Error("generative_aspect_ratio_must_be_9_16");
  const prompt = String(request?.prompt || "").trim();
  if (prompt.length < 8 || prompt.length > 1200) throw new Error("invalid_generative_prompt");
  return { ...request, prompt, durationSeconds, aspectRatio: "9:16" };
}

export function estimateGenerativeCostSek(request, costPerSecondSek) {
  const validated = validateGenerativeRequest(request);
  const unit = Number(costPerSecondSek);
  if (!Number.isFinite(unit) || unit < 0) return null;
  return Number((validated.durationSeconds * unit).toFixed(6));
}

function fakeMp4(durationSeconds) {
  const dir = mkdtempSync(`${tmpdir()}/stockbox-generative-fake-`);
  const path = resolve(dir, "clip.mp4");
  try {
    const result = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc2=size=720x1280:rate=30:duration=${durationSeconds}`,
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        path,
      ],
      { stdio: "pipe" },
    );
    if (result.status !== 0) throw new Error("fake_generative_ffmpeg_failed");
    return new Uint8Array(readFileSync(path));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function generateGenerativeClip({
  request,
  endpoint = process.env.GROWTH_GENERATIVE_VIDEO_ENDPOINT || "",
  token = process.env.GROWTH_GENERATIVE_VIDEO_TOKEN || "",
  fake = process.env.GROWTH_GENERATIVE_FAKE === "1",
  forceFailure = process.env.GROWTH_GENERATIVE_FORCE_FAILURE === "1",
  timeoutMs = 90_000,
}) {
  const validated = validateGenerativeRequest(request);
  if (forceFailure) throw new Error("forced_generative_provider_failure");

  if (fake) {
    return {
      bytes: fakeMp4(validated.durationSeconds),
      mimeType: "video/mp4",
      actualCostSek: 0,
      provider: "fake",
    };
  }

  if (!endpoint || !token) throw new Error("generative_provider_not_configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(90_000, Math.max(1_000, timeoutMs)));
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "video/mp4",
      },
      body: JSON.stringify({
        prompt: validated.prompt,
        duration_seconds: validated.durationSeconds,
        aspect_ratio: "9:16",
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`generative_provider_${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("video/mp4")) throw new Error("generative_provider_invalid_content_type");
    const costHeader = Number(response.headers.get("x-actual-cost-sek"));
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mimeType: "video/mp4",
      actualCostSek: Number.isFinite(costHeader) && costHeader >= 0 ? costHeader : undefined,
      provider: "external",
    };
  } finally {
    clearTimeout(timer);
  }
}
