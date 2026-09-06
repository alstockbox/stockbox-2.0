import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repositoryPath = "src/lib/paper-trading/competition-repository-v3.ts";
const source = existsSync(repositoryPath) ? readFileSync(repositoryPath, "utf8") : "";

describe("Paper Trading V3 competition repository boundary", () => {
  it("maps competition terms fail-closed and requires the fixed starting capital", () => {
    expect(source).toContain("export type PaperCompetitionV3");
    expect(source).toContain("startingCash: 100_000");
    expect(source).toContain("row.starting_cash");
    expect(source).toContain("startingCash !== 100_000");
    expect(source).toContain("kind === \"challenge\" || kind === \"private_league\"");
    expect(source).toContain("status === \"open\" || status === \"active\" || status === \"completed\" || status === \"cancelled\"");
  });

  it("discovers only open public challenges and never private leagues", () => {
    expect(source).toContain("export async function listOpenPaperChallengesV3");
    expect(source).toContain('.from("paper_competitions_v3")');
    expect(source).toContain('.eq("kind", "challenge")');
    expect(source).toContain('.eq("status", "open")');
    expect(source).toContain('.gt("join_deadline", nowIso)');
    expect(source).toContain('.gt("starts_at", nowIso)');
  });

  it("binds a user's competition entries to the supplied authenticated user id", () => {
    expect(source).toContain("export async function listPaperCompetitionEntriesV3");
    expect(source).toContain('.from("paper_competition_entries_v3")');
    expect(source).toContain('.eq("user_id", normalizedUserId)');
  });

  it("joins only through the service-role RPC using user and competition identity", () => {
    expect(source).toContain("export async function joinPaperCompetitionV3");
    expect(source).toContain('.rpc("join_paper_competition_v3", {');
    expect(source).toContain("p_user_id: normalizedUserId");
    expect(source).toContain("p_competition_id: normalizedCompetitionId");
    expect(source).not.toContain("p_starting_cash");
    expect(source).not.toContain("p_base_currency");
    expect(source).not.toContain("p_account_id");
  });

  it("never writes competition tables directly", () => {
    expect(source).not.toMatch(/\.from\(["']paper_competitions_v3["']\)[\s\S]{0,300}\.(insert|update|delete)\(/);
    expect(source).not.toMatch(/\.from\(["']paper_competition_entries_v3["']\)[\s\S]{0,300}\.(insert|update|delete)\(/);
    expect(source).not.toMatch(/\.from\(["']paper_accounts_v3["']\)[\s\S]{0,300}\.(insert|update|delete)\(/);
  });
});