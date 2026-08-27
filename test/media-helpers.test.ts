import { describe, it, expect } from "bun:test";

function sanitizeFilename(originalName: string): string {
  const lastDotIndex = originalName.lastIndexOf(".");
  const name =
    lastDotIndex !== -1 ? originalName.slice(0, lastDotIndex) : originalName;
  const ext =
    lastDotIndex !== -1
      ? originalName.slice(lastDotIndex + 1).toLowerCase()
      : "";

  const cleanName =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "file";

  return ext ? `${cleanName}.${ext}` : cleanName;
}

describe("Media Helpers", () => {
  it("sanitizes simple filenames", () => {
    expect(sanitizeFilename("My Photo.PNG")).toBe("my-photo.png");
    expect(sanitizeFilename("Diagram @ 2026 #1.jpg")).toBe(
      "diagram-2026-1.jpg",
    );
    expect(sanitizeFilename("complex__file--name.webp")).toBe(
      "complex__file--name.webp",
    );
  });

  it("handles filenames with multiple dots", () => {
    expect(sanitizeFilename("backup.archive.v2.tar.gz")).toBe(
      "backup-archive-v2-tar.gz",
    );
  });

  it("handles empty or special character filenames", () => {
    expect(sanitizeFilename("!@#$%^.png")).toBe("file.png");
  });
});
