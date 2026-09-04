import { describe, expect, it } from "vitest";
import { classifyGrowthRun } from "@/lib/growth/growth-diagnostics";

describe("growth diagnostics", () => {
  it("treats Gemini 503 plus successful deterministic workflow as recovered", () => {
    expect(classifyGrowthRun({
      run: { workflow: "SB-13-edge-v2", status: "success", detail: { ai: 0, deterministic: 2 } },
      relatedErrors: [{ source: "SB-AI-edge-v2", error_type: "gemini_failure", message: "Gemini 503" }],
    }).state).toBe("degraded_recovered");
  });

  it("treats an RSS timeout followed by successful discovery as recovered", () => {
    const result = classifyGrowthRun({
      run: { workflow: "SB-10-edge-v2", status: "success", detail: { evergreen: 16, accepted_news: 0, rss_circuit_open: true } },
      relatedErrors: [{ source: "SB-10-edge-v2", error_type: "rss_discovery", message: "Signal timed out" }],
    });
    expect(result.state).toBe("degraded_recovered");
    expect(result.founderMessage.toLowerCase()).not.toContain("krasch");
  });

  it("requires action when render failed with no replacement", () => {
    const result = classifyGrowthRun({
      run: { workflow: "SB-15-render-v3", status: "failed", detail: {} },
      relatedErrors: [{ source: "render-worker", error_type: "render_failed", message: "ffmpeg failed" }],
    });
    expect(result.state).toBe("action_required");
  });

  it("treats clean success as healthy", () => {
    expect(classifyGrowthRun({
      run: { workflow: "SB-80-edge-v2", status: "success", detail: { unique: 14 } },
      relatedErrors: [],
    }).state).toBe("healthy");
  });
});
