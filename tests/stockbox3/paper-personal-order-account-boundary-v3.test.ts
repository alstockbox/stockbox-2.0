import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const actionsPath = path.join(process.cwd(), "src/app/paper-trading/actions.ts");
const repositoryPath = path.join(process.cwd(), "src/lib/paper-trading/repository-v3.ts");
const actions = fs.readFileSync(actionsPath, "utf8");
const repository = fs.readFileSync(repositoryPath, "utf8");

function functionBlock(source: string, signature: string, nextSignature: string): string {
  const start = source.indexOf(signature);
  const end = source.indexOf(nextSignature, start + signature.length);
  return start >= 0 ? source.slice(start, end >= 0 ? end : source.length) : "";
}

const orderAction = functionBlock(
  actions,
  "export async function executePaperOrderAction",
  "export async function",
);

describe("Paper Trading V3 personal order account boundary", () => {
  it("loads a strict server-side account boundary with account type before order execution", () => {
    expect(repository).toContain("export async function loadPaperAccountBoundaryV3");
    expect(repository).toContain('.select("id,user_id,status,account_type,competition_id")');
    expect(repository).toContain('.eq("id", accountId)');
    expect(repository).toContain('.eq("user_id", userId)');
    expect(repository).toContain('accountType: "personal" | "competition"');
  });

  it("fails closed when account type and competition identity disagree", () => {
    expect(repository).toContain('accountType === "personal" && competitionId !== null');
    expect(repository).toContain('accountType === "competition" && competitionId === null');
    expect(repository).toContain('"PAPER_ACCOUNT_BOUNDARY_INVALID"');
  });

  it("checks ownership/type before entering the order service", () => {
    expect(orderAction).toContain("loadPaperAccountBoundaryV3(user.id, parsed.data.accountId)");
    expect(orderAction).toContain('boundary.account.accountType !== "personal"');
    expect(orderAction).toContain('boundary.account.status !== "active"');
    expect(orderAction).toContain("executePaperOrderServiceV3");

    const boundaryIndex = orderAction.indexOf("loadPaperAccountBoundaryV3(user.id, parsed.data.accountId)");
    const serviceIndex = orderAction.indexOf("executePaperOrderServiceV3");
    expect(boundaryIndex).toBeGreaterThanOrEqual(0);
    expect(serviceIndex).toBeGreaterThan(boundaryIndex);
  });

  it("never accepts account type or competition identity from FormData", () => {
    expect(orderAction).not.toContain('formData.get("accountType")');
    expect(orderAction).not.toContain('formData.get("competitionId")');
    expect(orderAction).not.toContain('formData.get("competition_id")');
  });
});
