import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { withdrawalReceiptText } from "../../src/lib/legal/withdrawal";

const root = process.cwd();
const source = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("consumer withdrawal flow", () => {
  it("creates an own-readable, service-written audit trail", () => {
    const migration = source("supabase/migrations/20260828194306_withdrawal_requests.sql");
    expect(migration).toContain("create table if not exists public.withdrawal_requests");
    expect(migration).toContain("withdrawal_requests_select_own");
    expect(migration).toContain("revoke all on public.withdrawal_requests from anon");
    expect(migration).toContain("revoke insert, update, delete");
    expect(migration).toContain("grant select on public.withdrawal_requests to authenticated");
  });

  it("keeps the withdrawal function easy to find and does not demand a reason", () => {
    const page = source("src/app/withdraw/page.tsx");
    const footer = source("src/components/app-shell/footer.tsx");
    expect(footer).toContain("/withdraw");
    expect(page).toContain('name="confirm"');
    expect(page).not.toContain('name="reason"');
    expect(page.toLowerCase()).toContain("mottagningsbevis");
  });
  it("produces a storable receipt with timestamp and contract identifier", () => {
    const text = withdrawalReceiptText({
      id: "receipt-1",
      submittedAt: "2026-08-28T18:00:00.000Z",
      stripeSubscriptionId: "sub_123",
      planKey: "basic",
      status: "received",
    });
    expect(text).toContain("Receipt ID: receipt-1");
    expect(text).toContain("Received at: 2026-08-28T18:00:00.000Z");
    expect(text).toContain("Subscription: sub_123");
  });
});
