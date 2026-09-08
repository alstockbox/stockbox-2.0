import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";

const DEFAULT_OUTPUT = "scripts/diagnostics/data/global_etf_investment_tickers_20000.txt";
const PART_PREFIX = "scripts/diagnostics/data/global_etf_investment_tickers_20000.zlib.b64.part";
const EXPECTED_SHA256 = "b4a63edf1564459dd849724f736145dd0ceb896cf178ec69994a9bebafc71e91";
const EXPECTED_TICKER_COUNT = 20_000;
const EXPECTED_BYTE_LENGTH = 182_557;
const EXPECTED_PART_COUNT = 8;
const ADLER_MODULUS = 65_521;

function parseTickers(raw) {
  return raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function sha256Hex(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function adler32(raw) {
  let a = 1;
  let b = 0;
  for (const byte of raw) {
    a = (a + byte) % ADLER_MODULUS;
    b = (b + a) % ADLER_MODULUS;
  }
  return ((b << 16) | a) >>> 0;
}

function positiveModulo(value, modulus = ADLER_MODULUS) {
  return ((value % modulus) + modulus) % modulus;
}

function modularInverse(value) {
  let oldR = ADLER_MODULUS;
  let r = positiveModulo(value);
  let oldS = 0;
  let s = 1;

  while (r !== 0) {
    const quotient = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }

  if (oldR !== 1) return null;
  return positiveModulo(oldS);
}

function recoverRawDeflateFromZlib(payload) {
  if (payload.length < 6) {
    throw new Error("zlib payload is too short to contain a valid envelope");
  }

  const cmf = payload[0];
  const flg = payload[1];
  const compressionMethod = cmf & 0x0f;
  const headerChecksumValid = ((cmf << 8) + flg) % 31 === 0;
  const presetDictionary = (flg & 0x20) !== 0;

  if (compressionMethod !== 8 || !headerChecksumValid || presetDictionary) {
    throw new Error("zlib envelope is not a supported dictionary-free DEFLATE stream");
  }

  return inflateRawSync(payload.subarray(2, -4));
}

function repairSingleRawByteFromAdler(raw, payload) {
  if (raw.length !== EXPECTED_BYTE_LENGTH || payload.length < 6) return null;

  const expectedAdler = payload.readUInt32BE(payload.length - 4);
  const currentAdler = adler32(raw);
  const expectedA = expectedAdler & 0xffff;
  const expectedB = expectedAdler >>> 16;
  const currentA = currentAdler & 0xffff;
  const currentB = currentAdler >>> 16;
  const deltaAMod = positiveModulo(expectedA - currentA);
  const delta = deltaAMod <= 255
    ? deltaAMod
    : deltaAMod >= ADLER_MODULUS - 255
      ? deltaAMod - ADLER_MODULUS
      : null;

  if (delta === null || delta === 0) return null;
  const inverse = modularInverse(delta);
  if (inverse === null) return null;

  const deltaB = positiveModulo(expectedB - currentB);
  const weightResidue = (deltaB * inverse) % ADLER_MODULUS;
  const firstWeight = weightResidue === 0 ? ADLER_MODULUS : weightResidue;

  for (let weight = firstWeight; weight <= raw.length; weight += ADLER_MODULUS) {
    const index = raw.length - weight;
    const repairedValue = raw[index] + delta;
    if (repairedValue < 0 || repairedValue > 255) continue;

    const repaired = Buffer.from(raw);
    repaired[index] = repairedValue;
    if (adler32(repaired) !== expectedAdler) continue;
    if (sha256Hex(repaired) !== EXPECTED_SHA256) continue;

    return {
      raw: repaired,
      index,
      from: raw[index],
      to: repairedValue,
    };
  }

  return null;
}

export function materializeGlobalAuditCorpus(outputPath = DEFAULT_OUTPUT) {
  const parts = [];

  for (let index = 0; index < EXPECTED_PART_COUNT; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const partPath = `${PART_PREFIX}${suffix}`;
    if (!existsSync(partPath)) {
      throw new Error(`Missing global audit corpus payload part: ${partPath}`);
    }
    parts.push(readFileSync(partPath, "utf8").trim());
  }

  const encoded = parts.join("");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("Global audit corpus payload is not valid base64 text");
  }

  const payload = Buffer.from(encoded, "base64");
  let raw;
  let recoveredZlibChecksum = false;
  let repairedRawByte = null;
  try {
    raw = inflateSync(payload);
  } catch (inflateError) {
    try {
      raw = recoverRawDeflateFromZlib(payload);
      recoveredZlibChecksum = true;
    } catch (recoveryError) {
      throw new Error(
        `Failed to inflate global audit corpus payload: ${inflateError instanceof Error ? inflateError.message : String(inflateError)}; raw DEFLATE recovery also failed: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`,
      );
    }
  }

  if (raw.length !== EXPECTED_BYTE_LENGTH) {
    throw new Error(`Global audit corpus byte length mismatch: expected ${EXPECTED_BYTE_LENGTH}, received ${raw.length}`);
  }

  let sha256 = sha256Hex(raw);
  if (sha256 !== EXPECTED_SHA256 && recoveredZlibChecksum) {
    const repair = repairSingleRawByteFromAdler(raw, payload);
    if (repair) {
      raw = repair.raw;
      repairedRawByte = { index: repair.index, from: repair.from, to: repair.to };
      sha256 = sha256Hex(raw);
    }
  }

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
    recoveredZlibChecksum,
    repairedRawByte,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const outputPath = process.argv[2] ?? DEFAULT_OUTPUT;
  const result = materializeGlobalAuditCorpus(outputPath);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
