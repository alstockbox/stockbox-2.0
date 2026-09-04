type SupabaseClientLike = any;

const ACTIVE_PACKAGE_STATES = new Set(["draft", "ready", "posted"]);

function ageMs(now: number, createdAt: string) {
  const created = new Date(createdAt).getTime();
  return Number.isFinite(created) ? Math.max(0, now - created) : 0;
}

export async function runRetentionCleanup(
  supabase: SupabaseClientLike,
  configNumber: (key: string, fallback: number) => Promise<number>,
) {
  const limit = Math.max(1, Math.min(1000, Math.floor(await configNumber("growth_retention_cleanup_limit", 200))));
  const readyRetentionDays = Math.max(1, await configNumber("growth_ready_retention_days", 60));
  const now = Date.now();

  const { data: assets, error: assetsError } = await supabase
    .from("acq_media_assets")
    .select("id,bucket,storage_path,kind,created_at,render_job_id")
    .in("bucket", ["growth-render-staging", "growth-ready-assets"])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (assetsError) throw new Error(`retention_assets_query_failed:${assetsError.message}`);
  if (!assets?.length) return { considered: 0, deleted: 0, staging: 0, ready: 0 };

  const jobIds = [...new Set(assets.map((asset: any) => asset.render_job_id).filter(Boolean))];
  const jobState = new Map<string, string>();
  const packageStates = new Map<string, Set<string>>();

  if (jobIds.length) {
    const { data: jobs, error: jobsError } = await supabase
      .from("acq_render_jobs")
      .select("id,state")
      .in("id", jobIds);
    if (jobsError) throw new Error(`retention_jobs_query_failed:${jobsError.message}`);
    for (const job of jobs || []) jobState.set(job.id, job.state);

    const { data: packages, error: packagesError } = await supabase
      .from("acq_distribution_packages")
      .select("render_job_id,status")
      .in("render_job_id", jobIds);
    if (packagesError) throw new Error(`retention_packages_query_failed:${packagesError.message}`);
    for (const item of packages || []) {
      const set = packageStates.get(item.render_job_id) || new Set<string>();
      set.add(item.status);
      packageStates.set(item.render_job_id, set);
    }
  }

  const actions: any[] = [];
  const readyRetentionMs = readyRetentionDays * 86_400_000;
  const failedStagingMs = 24 * 60 * 60 * 1000;

  for (const asset of assets) {
    if (asset.bucket === "growth-voice-private") continue;
    const state = asset.render_job_id ? jobState.get(asset.render_job_id) || null : null;
    const age = ageMs(now, asset.created_at);

    if (asset.bucket === "growth-render-staging") {
      if (state === "ready" || (state === "failed" && age >= failedStagingMs)) {
        actions.push(asset);
      }
      continue;
    }

    if (asset.bucket === "growth-ready-assets" && age >= readyRetentionMs) {
      const states = asset.render_job_id ? packageStates.get(asset.render_job_id) : null;
      const protectedByPackage = states ? [...states].some((status) => ACTIVE_PACKAGE_STATES.has(status)) : false;
      if (!protectedByPackage) actions.push(asset);
    }
  }

  let deleted = 0;
  let staging = 0;
  let ready = 0;
  for (const bucket of ["growth-render-staging", "growth-ready-assets"]) {
    const selected = actions.filter((asset) => asset.bucket === bucket);
    if (!selected.length) continue;
    const { error: removeError } = await supabase.storage.from(bucket).remove(selected.map((asset) => asset.storage_path));
    if (removeError) throw new Error(`retention_storage_remove_failed:${bucket}`);
    const ids = selected.map((asset) => asset.id);
    const { error: deleteError } = await supabase.from("acq_media_assets").delete().in("id", ids);
    if (deleteError) throw new Error(`retention_asset_row_delete_failed:${bucket}`);
    deleted += selected.length;
    if (bucket === "growth-render-staging") staging += selected.length;
    else ready += selected.length;
  }

  return { considered: assets.length, deleted, staging, ready };
}
