import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { markContractConfirmationFailed, markContractConfirmationSent } from "../../src/lib/billing/contract-confirmation-delivery";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260830220500_contract_confirmation_delivery.sql"),
  "utf8",
).replace(/\s+/g, " ").toLowerCase();

describe("contract confirmation delivery persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
  });

  it("only treats sent persistence as successful when a pending delivery row was updated", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(markContractConfirmationSent("in_1", "email_1")).resolves.toBe(false);
  });

  it("only treats failed persistence as successful when a pending delivery row was updated", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(markContractConfirmationFailed("in_1")).resolves.toBe(false);
  });

  it("makes the sent marker return whether a row was actually updated", () => {
    expect(migration).toContain("create or replace function public.mark_contract_confirmation_sent");
    expect(migration).toContain("returns boolean");
    expect(migration).toContain("returning stripe_invoice_id into v_invoice_id");
    expect(migration).toContain("return v_invoice_id is not null");
  });

  it("makes the failed marker return whether a row was actually updated", () => {
    expect(migration).toContain("create or replace function public.mark_contract_confirmation_failed");
    expect(migration).toContain("returns boolean");
    expect(migration).toContain("set status = 'failed'");
    expect(migration).toContain("returning stripe_invoice_id into v_invoice_id");
  });
});
