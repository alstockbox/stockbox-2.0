import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { inflateSync } from "node:zlib";

const DEFAULT_OUTPUT = "scripts/diagnostics/data/global_etf_investment_tickers_20000.txt";
const PART_PREFIX = "scripts/diagnostics/data/global_etf_investment_tickers_20000.zlib.b64.part";
const EXPECTED_SHA256 = "b4a63edf1564459dd849724f736145dd0ceb896cf178ec69994a9bebafc71e91";
const EXPECTED_TICKER_COUNT = 20_000;
const EXPECTED_PART_COUNT = 8;
const PART_02_SUBPART_COUNT = 6;

function parseTickers(raw) {
  return raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function readPayloadFile(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing global audit corpus payload part: ${path}`);
  }
  return readFileSync(path, "utf8").trim();
}

function readEncodedPart(index) {
  const suffix = String(index).padStart(2, "0");
  if (index !== 2) {
    return readPayloadFile(`${PART_PREFIX}${suffix}`);
  }

  const subparts = [];
  for (let subpart = 0; subpart < PART_02_SUBPART_COUNT; subpart += 1) {
    subparts.push(readPayloadFile(`${PART_PREFIX}${suffix}.${subpart}`));
  }
  return subparts.join("");
}

export function materializeGlobalAuditCorpus(outputPath = DEFAULT_OUTPUT) {
  const parts = [];
  for (let index = 0; index < EXPECTED_PART_COUNT; index += 1) {
    parts.push(readEncodedPart(index));
  }

  const encoded = parts.join("");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("Global audit corpus payload is not valid base64 text");
  }

  const payload = Buffer.from(encoded, "base64");
  let raw;
  try {
    raw = inflateSync(payload);
  } catch (error) {
    throw new Error(`Failed to inflate global audit corpus payload: ${error instanceof Error ? error.message : String(error)}`);
  }

  const sha256 = createHash("sha256").update(raw).digest("hex");
  if (sha256 !== EXPECTED_SHA256) {
    throw new Error(`Global audit corpus SHA-256 mismatch: expected ${EXPECTED_SHA256}, received ${sha256}`);
  }

  const text = raw.toString("utf8");
  const tickers = parseTickers(text);
  if (tickers.length !== EXPECTED_TICKER_COUNT) {
    throw new Error(`Global audit corpus ticker count mismatch: expected ${EXPECTED_TICKER_COUNT}, received ${tickers.length}`);
  }

  const uniqueTickerCount = new Set(tickers).size;
  if (uniqueTickerCount !== EXPECTED_TICKER_COUNT) {
    throw new Error(`Global audit corpus unique ticker count mismatch: expected ${EXPECTED_TICKER_COUNT}, received ${uniqueTickerCount}`);
  }

  const resolvedOutput = resolve(outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, raw);

  return {
    outputPath: resolvedOutput,
    sha256,
    tickerCount: tickers.length,
    uniqueTickerCount,
    byteLength: raw.length,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const outputPath = process.argv[2] ?? DEFAULT_OUTPUT;
  const result = materializeGlobalAuditCorpus(outputPath);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
