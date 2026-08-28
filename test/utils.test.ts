import { describe, it, expect } from "bun:test";
import { slugify, formatDate, formatBytes } from "../src/lib/utils";

describe("Shared Utilities", () => {
  describe("slugify", () => {
    it("converts titles to url-friendly slugs", () => {
      expect(slugify("Hello World! 123")).toBe("hello-world-123");
      expect(slugify("  My First Blog Post  ")).toBe("my-first-blog-post");
      expect(slugify("Alice & Bob: The Full Story")).toBe(
        "alice-bob-the-full-story",
      );
      expect(slugify("")).toBe("post");
    });
  });

  describe("formatDate", () => {
    it("formats dates and timestamps consistently", () => {
      const d = new Date("2026-08-28T12:00:00Z");
      expect(formatDate(d)).toBe("Aug 28, 2026");
      expect(formatDate(d.getTime())).toBe("Aug 28, 2026");
      expect(formatDate("2026-08-28T12:00:00Z")).toBe("Aug 28, 2026");
      expect(formatDate("2026-08-28 12:00:00")).toBe("Aug 28, 2026");
      expect(formatDate("invalid-date")).toBe("—");
      expect(formatDate(null)).toBe("—");
      expect(formatDate(undefined)).toBe("—");
      expect(formatDate("")).toBe("—");
    });
  });

  describe("formatBytes", () => {
    it("formats byte values into human readable sizes", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(500)).toBe("500.0 B");
      expect(formatBytes(1024)).toBe("1.0 KB");
      expect(formatBytes(1024 * 1024 * 3.5)).toBe("3.5 MB");
      expect(formatBytes(1024 * 1024 * 1024 * 2.1)).toBe("2.1 GB");
    });
  });
});
