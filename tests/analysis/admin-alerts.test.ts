import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisReport } from "../../src/lib/analysis/types";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(), reserveAdminAlert: vi.fn(), markAdminAlertSent: vi.fn(),
  releaseAdminAlert: vi.fn(), logApplicationError: vi.fn(),
}));
vi.mock("@/lib/env/server", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/db/repositories", () => ({
  reserveAdminAlert: mocks.reserveAdminAlert, markAdminAlertSent: mocks.markAdminAlertSent,
  releaseAdminAlert: mocks.releaseAdminAlert, logApplicationError: mocks.logApplicationError,
}));
import { sendStrongResearchAlert } from "../../src/lib/notifications/admin-alerts";

function report(score = 90, confidence = 85, dataCoverage = 0.9) {
  return { id: "00000000-0000-4000-8000-000000000099", ticker: "QA", companyName: "QA Corp",
    recommendation: "Hold", score: { score, confidence }, dataCoverage, oneSentence: "QA alert." } as unknown as AnalysisReport;
}

describe("Strong research-view admin alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test",
      ADMIN_ALERT_EMAIL: "owner@example.test", FROM_EMAIL: "alerts@example.test" });
    mocks.reserveAdminAlert.mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "msg_1" }), { status: 200 })));
  });

  it("skips reports whose neutral research view is not Strong", async () => {
    await sendStrongResearchAlert(report(68), "https://stockbox.test/admin");
    expect(mocks.reserveAdminAlert).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not trigger from a legacy Strong Buy label when the neutral view is not Strong", async () => {
    const legacy = { ...report(68), recommendation: "Strong Buy" } as AnalysisReport;
    await sendStrongResearchAlert(legacy, "https://stockbox.test/admin");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deduplicates before calling Resend", async () => {
    mocks.reserveAdminAlert.mockResolvedValue(false);
    await sendStrongResearchAlert(report(), "https://stockbox.test/admin");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.markAdminAlertSent).not.toHaveBeenCalled();
  });

  it("marks a successful Resend delivery as sent", async () => {
    const qa = report();
    await sendStrongResearchAlert(qa, "https://stockbox.test/admin");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.markAdminAlertSent).toHaveBeenCalledWith(qa.id, "msg_1");
    expect(mocks.releaseAdminAlert).not.toHaveBeenCalled();
  });
  it("releases the reservation when Resend rejects the request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("denied", { status: 503 }));
    const qa = report();
    await sendStrongResearchAlert(qa, "https://stockbox.test/admin");
    expect(mocks.releaseAdminAlert).toHaveBeenCalledWith(qa.id);
    expect(mocks.markAdminAlertSent).not.toHaveBeenCalled();
    expect(mocks.logApplicationError).toHaveBeenCalledWith(expect.objectContaining({
      service: "admin-alerts",
      message: "Resend rejected strong research-view alert.",
    }));
  });

  it("skips safely when email configuration is incomplete", async () => {
    mocks.getServerEnv.mockReturnValue({ EMAIL_PROVIDER: "resend" });
    await sendStrongResearchAlert(report(), "https://stockbox.test/admin");
    expect(mocks.reserveAdminAlert).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.logApplicationError).toHaveBeenCalledOnce();
  });
});
