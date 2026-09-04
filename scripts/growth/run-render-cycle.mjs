const API_URL = process.env.GROWTH_WORKER_API_URL || "";
const API_TOKEN = process.env.GROWTH_RENDER_WORKER_TOKEN || "";

function required(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function apiAction(action) {
  const response = await fetch(required("GROWTH_WORKER_API_URL", API_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stockbox-growth-worker-token": required("GROWTH_RENDER_WORKER_TOKEN", API_TOKEN),
    },
    body: JSON.stringify({ action }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`growth_${action}_${response.status}:${data.error || "unknown"}`);
  return data;
}

const retention = await apiAction("cleanup");
console.log(JSON.stringify({ retention: retention.retention || {} }));
const materialize = await apiAction("materialize");
console.log(JSON.stringify({ materialize }));
await import("./run-render-worker.mjs");
