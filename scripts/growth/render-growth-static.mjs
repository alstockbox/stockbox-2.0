import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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
const outPath = resolve(arg("--out"));
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const headline = String(spec.headline || spec.title || "").trim();
const body = String(spec.body || spec.caption || "").trim();
const cta = String(spec.cta?.text || spec.cta || "Analysera i StockBox").trim();
if (!headline || !body || !cta) throw new Error("Static growth image requires headline, body, and CTA");

mkdirSync(dirname(outPath), { recursive: true });
const propsPath = `${outPath}.props.json`;
writeFileSync(propsPath, JSON.stringify({ headline, body, cta }));
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
run(process.platform === "win32" ? "npx.cmd" : "npx", [
  "remotion",
  "still",
  resolve(repoRoot, "src/video/carousel/index.ts"),
  "GrowthStaticCard",
  outPath,
  `--props=${propsPath}`,
  "--image-format=png",
  "--log=error",
]);
process.stdout.write(JSON.stringify({ ok: true, output: outPath, width: 1080, height: 1350 }) + "\n");
