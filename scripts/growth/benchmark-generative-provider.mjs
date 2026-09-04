import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { estimateGenerativeCostSek, generateGenerativeClip } from "./generative-provider.mjs";

const durationSeconds = Math.min(5, Math.max(2, Number(process.env.GROWTH_GENERATIVE_BENCHMARK_SECONDS || 3)));
const request = {
  contentId: "benchmark",
  sceneId: "benchmark",
  prompt: process.env.GROWTH_GENERATIVE_BENCHMARK_PROMPT || "Abstract financial data moving through a clean vertical interface",
  durationSeconds,
  aspectRatio: "9:16",
};
const costPerSecond = Number(process.env.GROWTH_GENERATIVE_COST_SEK_PER_SECOND);
const estimatedCostSek = estimateGenerativeCostSek(request, costPerSecond);
if (estimatedCostSek === null && process.env.GROWTH_GENERATIVE_FAKE !== "1") {
  throw new Error("Known GROWTH_GENERATIVE_COST_SEK_PER_SECOND is required before a paid benchmark");
}

const started = Date.now();
const result = await generateGenerativeClip({ request });
const latencyMs = Date.now() - started;
const dir = mkdtempSync(`${tmpdir()}/stockbox-generative-benchmark-`);
const path = resolve(dir, "benchmark.mp4");
let decodable = false;
try {
  writeFileSync(path, result.bytes);
  const probe = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,duration", "-of", "json", path],
    { encoding: "utf8" },
  );
  decodable = probe.status === 0;
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const actualCostSek = result.actualCostSek ?? estimatedCostSek ?? 0;
process.stdout.write(
  JSON.stringify({
    duration_seconds: durationSeconds,
    estimated_cost_sek: estimatedCostSek,
    actual_cost_sek: actualCostSek,
    latency_ms: latencyMs,
    decodable,
    usable: decodable && result.bytes.byteLength > 0,
    provider: result.provider,
  }) + "\n",
);
