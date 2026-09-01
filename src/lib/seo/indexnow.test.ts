import { describe, expect, it } from "vitest";
import { buildIndexNowPayload, isValidIndexNowKey } from "./indexnow";

describe("buildIndexNowPayload", () => {
  it("deduplicates URLs, excludes other hosts and uses a root-level key file", () => {
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
      keyLocation: "https://www.getstockbox.app/indexnow-key.txt",
      urlList: [
        "https://www.getstockbox.app/aktier/mycronic",
        "https://www.getstockbox.app/aktier",
      ],
    });
  });

  it("accepts only IndexNow protocol keys", () => {
    expect(isValidIndexNowKey("abcdEF12-3456")).toBe(true);
    expect(isValidIndexNowKey("short")).toBe(false);
    expect(isValidIndexNowKey("invalid_key_value")).toBe(false);
  });
});
