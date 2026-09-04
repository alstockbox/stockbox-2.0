import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { generateGenerativeClip } from "./generative-provider.mjs";

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command}_failed_${result.status}:${capture ? String(result.stderr || result.stdout).slice(0, 1000) : ""}`);
  }
  return capture ? String(result.stdout || "") : "";
}

const mode = arg("--mode", "success");
if (!["success", "fallback"].includes(mode)) throw new Error("Mode must be success or fallback");
const requestedOut = arg("--out");
const workdir = mkdtempSync(`${tmpdir()}/stockbox-generative-render-smoke-`);
const output = requestedOut ? resolve(requestedOut) : resolve(workdir, "final.mp4");

try {
  const clipPath = resolve(workdir, "generated.mp4");
  let visualRef;
  let fallbackUsed = false;
  try {
    const generated = await generateGenerativeClip({
      request: {
        contentId: "smoke-content",
        sceneId: "micro",
        prompt: "Abstract clean financial chart motion with soft geometric shapes and no text",
        durationSeconds: 3,
        aspectRatio: "9:16",
      },
      fake: true,
      forceFailure: mode === "fallback",
    });
    writeFileSync(clipPath, Buffer.from(generated.bytes));
    visualRef = pathToFileURL(clipPath).href;
  } catch {
    fallbackUsed = true;
  }

  const spec = {
    version: "v3",
    contentId: "smoke-content",
    renderJobId: `smoke-${mode}`,
    language: "sv",
    template: "educational_checklist",
    title: "Tre saker att kontrollera",
    hook: "Tre varningssignaler på 30 sekunder",
    script: "Första punkten är skuldsättningen. Titta på trenden och sätt siffrorna i sitt sammanhang.",
    voiceMode: "educational",
    scenes: [
      { id: "hook", kind: "motion_graphic", startMs: 0, endMs: 6000, headline: "Tre varningssignaler", body: "Börja med helheten." },
      { id: "stockbox", kind: "stockbox_ui", startMs: 6000, endMs: 16000, headline: "Kontrollera skulden", body: "Jämför skuld, kassaflöde och räntetäckning." },
      {
        id: "micro",
        kind: "generated_micro_scene",
        startMs: 16000,
        endMs: 19000,
        headline: "Sätt siffrorna i sammanhang",
        body: "Visualisera hur datapunkterna hänger ihop.",
        prompt: "Abstract clean financial chart motion with soft geometric shapes and no text",
        fallbackKind: "motion_graphic",
        fallbackHeadline: "Sätt siffrorna i sammanhang",
        fallbackBody: "Koppla värdering, lönsamhet och risk till samma helhetsbild.",
        ...(visualRef ? { visualRef } : {}),
      },
      { id: "analysis", kind: "chart", startMs: 19000, endMs: 25000, headline: "Se utvecklingen", body: "En enskild siffra säger mindre än trenden." },
      { id: "cta", kind: "cta", startMs: 25000, endMs: 30000, headline: "Fördjupa analysen", body: "Samla analysen i StockBox." },
    ],
    subtitles: [{ startMs: 1000, endMs: 5000, text: "Tre saker att kontrollera" }],
    cta: { text: "Analysera bolaget i StockBox", url: "https://www.getstockbox.app/" },
  };

  const specPath = resolve(workdir, "spec.json");
  const voicePath = resolve(workdir, "voice.wav");
  writeFileSync(specPath, JSON.stringify(spec));
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=30", "-ar", "48000", "-ac", "1", voicePath]);
  run("node", ["scripts/growth/render-growth-video.mjs", "--spec", specPath, "--voice", voicePath, "--out", output]);
  const qcRaw = run("node", ["scripts/growth/validate-growth-video.mjs", "--video", output], true).trim();
  const qc = JSON.parse(qcRaw.split("\n").filter(Boolean).at(-1));
  if (qc.passed !== true) throw new Error(`QC failed: ${(qc.reasons || []).join(",")}`);

  process.stdout.write(JSON.stringify({ ok: true, mode, fallback_used: fallbackUsed, qc, output_bytes: readFileSync(output).byteLength }) + "\n");
} finally {
  if (!requestedOut) rmSync(workdir, { recursive: true, force: true });
}
