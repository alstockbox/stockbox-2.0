const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
const DATE_SEGMENT = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_EXTENSIONS = new Set(["mp4", "jpg", "png", "wav", "json", "zip", "txt"]);

export type GrowthAssetExtension = "mp4" | "jpg" | "png" | "wav" | "json" | "zip" | "txt";

export type GrowthAssetPathInput = {
  date: string;
  contentId: string;
  renderJobId: string;
  kind: string;
  extension: GrowthAssetExtension;
};

function assertSafeSegment(name: string, value: string) {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(`${name} contains unsafe path characters`);
  }
}

function assertIsoDate(value: string) {
  if (!DATE_SEGMENT.test(value)) {
    throw new Error("date must use YYYY-MM-DD");
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("date must be a valid calendar date");
  }
}

export function buildGrowthAssetPath(input: GrowthAssetPathInput): string {
  assertIsoDate(input.date);
  assertSafeSegment("contentId", input.contentId);
  assertSafeSegment("renderJobId", input.renderJobId);
  assertSafeSegment("kind", input.kind);

  if (!ALLOWED_EXTENSIONS.has(input.extension)) {
    throw new Error("extension is not allowed for growth assets");
  }

  return `${input.date}/${input.contentId}/${input.renderJobId}/${input.kind}.${input.extension}`;
}
