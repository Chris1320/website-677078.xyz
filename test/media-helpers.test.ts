import { describe, it, expect } from "bun:test";
import {
  sanitizeFilename,
  computeSha256,
  isSafeFilename,
  getMimeTypeForExtension,
} from "../src/lib/media";

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

  it("computes identical SHA-256 hashes using computeSha256", async () => {
    const buffer1 = new TextEncoder().encode("Hello Cloudflare Media").buffer;
    const buffer2 = new TextEncoder().encode("Hello Cloudflare Media").buffer;
    const buffer3 = new TextEncoder().encode("Different Content").buffer;

    const hash1 = await computeSha256(buffer1);
    const hash2 = await computeSha256(buffer2);
    const hash3 = await computeSha256(buffer3);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1.length).toBe(64);
  });

  it("identifies safe vs dangerous filenames with isSafeFilename", () => {
    expect(isSafeFilename("valid-photo.png")).toBe(true);
    expect(isSafeFilename("photo_2026-08.webp")).toBe(true);
    expect(isSafeFilename("../../etc/passwd")).toBe(false);
    expect(isSafeFilename("..\\windows\\system32")).toBe(false);
    expect(isSafeFilename("uploads/file.png")).toBe(false);
    expect(isSafeFilename("null\0byte.png")).toBe(false);
    expect(isSafeFilename("")).toBe(false);
  });

  it("resolves correct MIME types for extensions", () => {
    expect(getMimeTypeForExtension("photo.jpg")).toBe("image/jpeg");
    expect(getMimeTypeForExtension("vector.svg")).toBe("image/svg+xml");
    expect(getMimeTypeForExtension("video.mp4")).toBe("video/mp4");
    expect(getMimeTypeForExtension("document.pdf")).toBe("application/pdf");
    expect(getMimeTypeForExtension("unknown.custom")).toBe(
      "application/octet-stream",
    );
  });
});
