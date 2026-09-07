import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("portfolio current snapshot revision UI", () => {
  it("uses only snapshots that match the current portfolio ledger revision", () => {
    const page = source("src/app/portfolio/page.tsx");

    expect(page).toContain('from("portfolio_ledger_revisions")');
    expect(page).toContain('select("portfolio_id,revision")');
    expect(page).toContain('ledger_revision');
    expect(page).toContain("currentLedgerRevision");
    expect(page).toContain("snapshotRevision === currentRevision");
  });
});
