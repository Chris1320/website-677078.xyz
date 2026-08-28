import { describe, it, expect } from "bun:test";
import {
  slugify,
  formatDate,
  formatBytes,
  getPaginationWindow,
} from "../src/lib/utils";

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

  describe("getPaginationWindow", () => {
    it("returns all pages when totalPages <= 7", () => {
      expect(getPaginationWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
      expect(getPaginationWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("returns beginning window with trailing ellipsis when current page <= 4", () => {
      expect(getPaginationWindow(1, 23)).toEqual([1, 2, 3, 4, 5, "...", 23]);
      expect(getPaginationWindow(4, 23)).toEqual([1, 2, 3, 4, 5, "...", 23]);
    });

    it("returns ending window with leading ellipsis when near end", () => {
      expect(getPaginationWindow(20, 23)).toEqual([
        1,
        "...",
        19,
        20,
        21,
        22,
        23,
      ]);
      expect(getPaginationWindow(23, 23)).toEqual([
        1,
        "...",
        19,
        20,
        21,
        22,
        23,
      ]);
    });

    it("returns middle window with both ellipses when in the middle", () => {
      expect(getPaginationWindow(14, 23)).toEqual([
        1,
        "...",
        13,
        14,
        15,
        "...",
        23,
      ]);
    });
  });
});
