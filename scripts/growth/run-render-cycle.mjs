const API_URL = process.env.GROWTH_WORKER_API_URL || "";
const API_TOKEN = process.env.GROWTH_RENDER_WORKER_TOKEN || "";

function required(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function materialize() {
  const response = await fetch(required("GROWTH_WORKER_API_URL", API_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stockbox-growth-worker-token": required("GROWTH_RENDER_WORKER_TOKEN", API_TOKEN),
    },
    body: JSON.stringify({ action: "materialize" }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`growth_materialize_${response.status}:${data.error || "unknown"}`);
  console.log(JSON.stringify({ materialize: data }));
}

await materialize();
await import("./run-render-worker.mjs");
