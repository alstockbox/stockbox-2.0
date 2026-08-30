import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("2026 public withdrawal-function requirements", () => {
  it("allows a consumer to submit the statutory notice without logging in", () => {
    const page = read("src/app/withdraw/page.tsx");
    expect(page).not.toContain("getCurrentUser");
    expect(page).toContain('name="consumerName"');
    expect(page).toContain('name="accountEmail"');
    expect(page).toContain('name="contractReference"');
    expect(page).toContain('name="confirmationEmail"');
    expect(page).toContain('name="confirm"');
  });

  it("accepts all StockBox paid plans instead of hard-coding Basic", () => {
    const actions = read("src/app/withdraw/actions.ts");
    expect(actions).not.toContain('planKey !== "basic"');
    expect(actions).not.toContain("requireUser");
    expect(actions).toContain("commerciallyActivePlans");
  });
  it("stores the identity, contract reference and requested receipt channel", () => {
    const migrationPath = "supabase/migrations/20260830211000_public_withdrawal_function.sql";
    expect(existsSync(join(root, migrationPath))).toBe(true);
    const migration = read(migrationPath);
    expect(migration).toContain("drop not null");
    expect(migration).toContain("consumer_name");
    expect(migration).toContain("account_email");
    expect(migration).toContain("confirmation_email");
    expect(migration).toContain("contract_reference");
    expect(migration).toContain("receipt_token_hash");
  });

  it("sends a durable receipt without delaying the recorded notice", () => {
    expect(existsSync(join(root, "src/lib/notifications/withdrawal-receipt.ts"))).toBe(true);
    const actions = read("src/app/withdraw/actions.ts");
    expect(actions).toContain("sendWithdrawalReceiptEmail");
    expect(actions).toContain("receiptDeliveryStatus");
    expect(actions).toContain("submitted_at");
  });
});

// Public receipt access uses a high-entropy one-time-style bearer token stored only as a hash.
describe("public withdrawal receipt access", () => {
  it("does not force account login after a public withdrawal submission", () => {
    const page = read("src/app/withdraw/receipt/[id]/page.tsx");
    const download = read("src/app/withdraw/receipt/[id]/download/route.ts");
    expect(page).not.toContain("requireUser");
    expect(page).toContain("receipt_token_hash");
    expect(page).toContain("searchParams");
    expect(download).not.toContain("getCurrentUser");
    expect(download).toContain("receipt_token_hash");
    expect(download).toContain('searchParams.get("token")');
  });
});
