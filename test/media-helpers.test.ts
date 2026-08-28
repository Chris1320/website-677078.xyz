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

  it("computes identical SHA-256 hashes for identical file contents", async () => {
    const data1 = new TextEncoder().encode("Hello Cloudflare Media");
    const data2 = new TextEncoder().encode("Hello Cloudflare Media");
    const data3 = new TextEncoder().encode("Different Content");

    const hashBuffer1 = await crypto.subtle.digest("SHA-256", data1);
    const hashHex1 = Array.from(new Uint8Array(hashBuffer1))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const hashBuffer2 = await crypto.subtle.digest("SHA-256", data2);
    const hashHex2 = Array.from(new Uint8Array(hashBuffer2))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const hashBuffer3 = await crypto.subtle.digest("SHA-256", data3);
    const hashHex3 = Array.from(new Uint8Array(hashBuffer3))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    expect(hashHex1).toBe(hashHex2);
    expect(hashHex1).not.toBe(hashHex3);
    expect(hashHex1.length).toBe(64);
  });
});
