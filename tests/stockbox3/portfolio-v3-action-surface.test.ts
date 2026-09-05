import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actions = readFileSync("src/lib/workspace/actions.ts", "utf8");
const page = readFileSync("src/app/portfolio/page.tsx", "utf8");

describe("Portfolio V3 server-action surface", () => {
  it("does not expose legacy direct derived-holding mutation actions", () => {
    expect(actions).not.toContain("export async function updateHoldingAction");
    expect(actions).not.toContain("export async function removeHoldingAction");
    expect(actions).not.toContain('.from("holdings").update(');
    expect(actions).not.toContain('.from("holdings").delete(');
  });

  it("keeps active buy/edit/delete transaction mutations on guarded RPCs", () => {
    expect(actions).toContain('p_transaction_type: "buy"');
    expect(actions).toContain('rpc("record_portfolio_transaction"');
    expect(actions).toContain('rpc("update_portfolio_transaction"');
    expect(actions).toContain('rpc("delete_portfolio_transaction"');
    expect(page).toContain("addHoldingAction");
    expect(page).toContain("updatePortfolioTransactionAction");
    expect(page).toContain("removePortfolioTransactionAction");
  });
});
