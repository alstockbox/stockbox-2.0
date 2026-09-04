import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import JSZip from "jszip";

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function validateSpec(input) {
  if (!input || input.version !== "v3") throw new Error("Invalid carousel version");
  if (!Array.isArray(input.slides) || input.slides.length < 3 || input.slides.length > 8) {
    throw new Error("Carousel requires 3-8 slides");
  }
  input.slides.forEach((slide, offset) => {
    if (slide.index !== offset + 1) throw new Error("Carousel slide indexes must be continuous from 1");
    if (!String(slide.headline || "").trim() || !String(slide.body || "").trim()) {
      throw new Error("Carousel slides require headline and body");
    }
  });
  return input;
}

const specPath = resolve(arg("--spec"));
const outDir = resolve(arg("--out-dir"));
const spec = validateSpec(JSON.parse(readFileSync(specPath, "utf8")));
mkdirSync(outDir, { recursive: true });

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const entry = resolve(repoRoot, "src/video/carousel/index.ts");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const rendered = [];

for (const slide of spec.slides) {
  const filename = `slide-${String(slide.index).padStart(2, "0")}.png`;
  const outputPath = resolve(outDir, filename);
  const propsPath = resolve(outDir, `.props-${String(slide.index).padStart(2, "0")}.json`);
  writeFileSync(propsPath, JSON.stringify({ slide, title: spec.title, totalSlides: spec.slides.length }));
  run(npx, [
    "remotion",
    "still",
    entry,
    "GrowthCarouselSlide",
    outputPath,
    `--props=${propsPath}`,
    "--image-format=png",
    "--log=error",
  ]);
  rendered.push({ filename, path: outputPath, width: 1080, height: 1350, checksumSha256: sha256(outputPath) });
}

const coverPath = resolve(outDir, "cover.png");
writeFileSync(coverPath, readFileSync(rendered[0].path));

const zip = new JSZip();
for (const item of rendered) zip.file(item.filename, readFileSync(item.path));
zip.file("cover.png", readFileSync(coverPath));
const zipBytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
const zipPath = resolve(outDir, "carousel.zip");
writeFileSync(zipPath, zipBytes);

const metadata = {
  version: "v3",
  content_id: spec.contentId,
  slide_count: rendered.length,
  width: 1080,
  height: 1350,
  files: [
    ...rendered.map((item) => ({
      name: item.filename,
      width: item.width,
      height: item.height,
      checksum_sha256: item.checksumSha256,
    })),
    { name: "cover.png", width: 1080, height: 1350, checksum_sha256: sha256(coverPath) },
    { name: "carousel.zip", checksum_sha256: sha256(zipPath) },
  ],
  generated_at: new Date().toISOString(),
};
const metadataPath = resolve(outDir, "metadata.json");
writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

process.stdout.write(JSON.stringify({ ok: true, outDir, files: [...rendered.map((item) => item.filename), "cover.png", "carousel.zip", "metadata.json"] }) + "\n");
