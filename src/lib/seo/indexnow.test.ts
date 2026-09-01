import { describe, expect, it } from "vitest";
import { buildIndexNowPayload } from "./indexnow";

describe("buildIndexNowPayload", () => {
  it("deduplicates URLs and excludes URLs from other hosts", () => {
    const payload = buildIndexNowPayload(
      [
        "https://www.getstockbox.app/aktier/mycronic",
        "https://www.getstockbox.app/aktier/mycronic",
        "https://www.getstockbox.app/aktier",
        "https://example.com/aktier/fake",
      ],
      "https://www.getstockbox.app",
      "test-key"
    );

    expect(payload).toEqual({
      host: "www.getstockbox.app",
      key: "test-key",
      keyLocation: "https://www.getstockbox.app/api/indexnow/key",
      urlList: [
        "https://www.getstockbox.app/aktier/mycronic",
        "https://www.getstockbox.app/aktier",
      ],
    });
  });
});
