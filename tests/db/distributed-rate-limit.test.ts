import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260827180007_distributed_rate_limits.sql"),
  "utf8",
).toLowerCase();

describe("distributed rate-limit migration", () => {
  it("keeps buckets private and the atomic RPC service-role only", () => {
    expect(sql).toContain("alter table public.rate_limit_buckets enable row level security");
    expect(sql).toContain("revoke all on table public.rate_limit_buckets from anon, authenticated");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).toContain("revoke all on function public.consume_rate_limit");
    expect(sql).toContain("grant execute on function public.consume_rate_limit");
    expect(sql).toContain("to service_role");
  });

  it("uses one atomic upsert keyed only by a hash", () => {
    expect(sql).toContain("key_hash text primary key");
    expect(sql).toContain("length(p_key_hash) <> 64");
    expect(sql).toContain("on conflict (key_hash) do update");
    expect(sql).not.toContain("inet");
  });
});
