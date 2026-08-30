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
import { sendStrongBuyAlert } from "../../src/lib/notifications/admin-alerts";

function report(recommendation: "Strong Buy" | "Buy" = "Strong Buy") {
  return { id: "00000000-0000-4000-8000-000000000099", ticker: "QA", companyName: "QA Corp",
    recommendation, score: { score: 90, confidence: 85 }, oneSentence: "QA alert." } as unknown as AnalysisReport;
}

describe("Strong Buy admin alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test",
      ADMIN_ALERT_EMAIL: "owner@example.test", FROM_EMAIL: "alerts@example.test" });
    mocks.reserveAdminAlert.mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "msg_1" }), { status: 200 })));
  });  it("skips non-Strong-Buy reports", async () => {
    await sendStrongBuyAlert(report("Buy"), "https://stockbox.test/admin");
    expect(mocks.reserveAdminAlert).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deduplicates before calling Resend", async () => {
    mocks.reserveAdminAlert.mockResolvedValue(false);
    await sendStrongBuyAlert(report(), "https://stockbox.test/admin");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.markAdminAlertSent).not.toHaveBeenCalled();
  });

  it("marks a successful Resend delivery as sent", async () => {
    const qa = report();
    await sendStrongBuyAlert(qa, "https://stockbox.test/admin");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.markAdminAlertSent).toHaveBeenCalledWith(qa.id, "msg_1");
    expect(mocks.releaseAdminAlert).not.toHaveBeenCalled();
  });
  it("releases the reservation when Resend rejects the request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("denied", { status: 503 }));
    const qa = report();
    await sendStrongBuyAlert(qa, "https://stockbox.test/admin");
    expect(mocks.releaseAdminAlert).toHaveBeenCalledWith(qa.id);
    expect(mocks.markAdminAlertSent).not.toHaveBeenCalled();
    expect(mocks.logApplicationError).toHaveBeenCalledWith(expect.objectContaining({
      service: "admin-alerts",
      message: "Resend rejected Strong Buy alert.",
    }));
  });

  it("skips safely when email configuration is incomplete", async () => {
    mocks.getServerEnv.mockReturnValue({ EMAIL_PROVIDER: "resend" });
    await sendStrongBuyAlert(report(), "https://stockbox.test/admin");
    expect(mocks.reserveAdminAlert).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.logApplicationError).toHaveBeenCalledOnce();
  });
});
