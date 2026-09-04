import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

const specPath = resolve(arg("--spec"));
const voicePath = resolve(arg("--voice"));
const outPath = resolve(arg("--out"));
const spec = JSON.parse(readFileSync(specPath, "utf8"));

if (!Array.isArray(spec.scenes) || spec.scenes.length === 0) throw new Error("Render spec must contain scenes");
const endMs = Math.max(...spec.scenes.map((scene) => Number(scene.endMs)));
if (!Number.isFinite(endMs) || endMs <= 0 || endMs > 60_000) throw new Error("Invalid render duration");

const workdir = mkdtempSync(`${tmpdir()}/stockbox-growth-render-`);
const propsPath = resolve(workdir, "props.json");
const visualPath = resolve(workdir, "visual.mp4");

try {
  writeFileSync(
    propsPath,
    JSON.stringify({
      spec,
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: Math.ceil((endMs / 1000) * 30),
    }),
  );

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  run(process.platform === "win32" ? "npx.cmd" : "npx", [
    "remotion",
    "render",
    resolve(repoRoot, "src/video/index.ts"),
    "GrowthVideo",
    visualPath,
    `--props=${propsPath}`,
    "--codec=h264",
    "--pixel-format=yuv420p",
    "--log=error",
  ]);

  run("ffmpeg", [
    "-y",
    "-i",
    visualPath,
    "-i",
    voicePath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11,apad",
    "-t",
    String(endMs / 1000),
    "-movflags",
    "+faststart",
    outPath,
  ]);

  process.stdout.write(JSON.stringify({ ok: true, output: outPath }) + "\n");
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
