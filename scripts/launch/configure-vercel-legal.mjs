import { pathToFileURL } from "node:url";

const PROJECT_ID = "prj_sGX0ggQFg59ds8Jv56tWrfEto4F5";
const TEAM_ID = "team_5V4xvUFeeOq6PGrJvaTeqldd";
const API_ROOT = "https://api.vercel.com";
const TARGETS = ["production", "preview"];

function required(value, name) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required.`);
  return trimmed;
}

function envEntry(key, value) {
  return {
    key,
    value: required(value, key),
    type: "sensitive",
    target: TARGETS,
    comment: "StockBox launch legal configuration"
  };
}

export function buildLegalEnvEntries(input) {
  const vatMode = required(input.vatMode, "LEGAL_VAT_MODE");
  if (!["small_business_exempt", "vat_registered"].includes(vatMode)) {
    throw new Error("LEGAL_VAT_MODE must be small_business_exempt or vat_registered.");
  }

  const entries = [
    envEntry("LEGAL_BUSINESS_NAME", input.businessName),
    envEntry("LEGAL_ORGANIZATION_NUMBER", input.organizationNumber),
    envEntry("LEGAL_POSTAL_ADDRESS", input.postalAddress),
    envEntry("LEGAL_SUPPORT_EMAIL", input.supportEmail),
    envEntry("LEGAL_SUPPORT_PHONE", input.supportPhone),
    envEntry("LEGAL_VAT_MODE", vatMode)
  ];

  if (vatMode === "vat_registered") {
    entries.push(envEntry("LEGAL_VAT_NUMBER", required(input.vatNumber, "LEGAL_VAT_NUMBER")));
  }
  return entries;
}

export function summarizeLegalEnvEntries(entries) {
  return {
    count: entries.length,
    keys: entries.map((entry) => entry.key).sort(),
    targets: TARGETS,
    sensitive: entries.every((entry) => entry.type === "sensitive")
  };
}

async function vercelRequest(token, path, init = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error(`Vercel API request failed with HTTP ${response.status}.`);
  }
  return response.json();
}

async function main() {
  const token = required(process.env.VERCEL_TOKEN, "VERCEL_TOKEN");
  const entries = buildLegalEnvEntries({
    businessName: process.env.LEGAL_BUSINESS_NAME,
    organizationNumber: process.env.LEGAL_ORGANIZATION_NUMBER,
    postalAddress: process.env.LEGAL_POSTAL_ADDRESS,
    supportEmail: process.env.LEGAL_SUPPORT_EMAIL,
    supportPhone: process.env.LEGAL_SUPPORT_PHONE,
    vatMode: process.env.LEGAL_VAT_MODE,
    vatNumber: process.env.LEGAL_VAT_NUMBER
  });

  const query = `?upsert=true&teamId=${encodeURIComponent(TEAM_ID)}`;
  await vercelRequest(token, `/v10/projects/${PROJECT_ID}/env${query}`, {
    method: "POST",
    body: JSON.stringify(entries)
  });

  const listed = await vercelRequest(
    token,
    `/v10/projects/${PROJECT_ID}/env?teamId=${encodeURIComponent(TEAM_ID)}`
  );
  const presentKeys = new Set((listed.envs ?? []).map((entry) => entry.key));
  const missing = entries.map((entry) => entry.key).filter((key) => !presentKeys.has(key));
  if (missing.length) throw new Error(`Vercel legal environment verification failed for: ${missing.join(", ")}.`);

  console.log("Vercel legal environment verified:", summarizeLegalEnvEntries(entries));
  console.log("A new deployment is required before updated environment values are active.");
}
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Vercel legal launch configuration failed.");
    process.exitCode = 1;
  });
}