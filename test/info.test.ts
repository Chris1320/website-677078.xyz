import { describe, it, expect } from "bun:test";
import * as info from "../src/lib/info";

describe("Application Constants", () => {
  it("exports valid media file and page size constraints", () => {
    expect(info.MAX_MEDIA_FILE_SIZE).toBe(25 * 1024 * 1024);
    expect(info.MEDIA_PAGE_SIZE).toBe(12);
    expect(info.ALLOWED_MEDIA_EXTENSIONS.has("png")).toBe(true);
    expect(info.ALLOWED_MEDIA_EXTENSIONS.has("jpg")).toBe(true);
    expect(info.ALLOWED_MEDIA_EXTENSIONS.has("pdf")).toBe(true);
    expect(info.ALLOWED_MEDIA_MIME_TYPES.has("image/png")).toBe(true);
  });

  it("exports valid post content constraints", () => {
    expect(info.MAX_POST_TITLE_LENGTH).toBe(500);
    expect(info.MAX_POST_DESCRIPTION_LENGTH).toBe(2000);
    expect(info.MAX_POST_CONTENT_LENGTH).toBe(5_000_000);
    expect(info.MAX_POST_SLUG_LENGTH).toBe(200);
    expect(info.MAX_POST_TAGS_COUNT).toBe(30);
    expect(info.MAX_POST_TAG_NAME_LENGTH).toBe(60);
  });

  it("exports valid pagination and site metadata", () => {
    expect(info.POSTS_PAGE_SIZE).toBe(10);
    expect(info.HOMEPAGE_RECENT_POSTS_LIMIT).toBe(5);
    expect(info.SITE_INFO.title).toBe("CFN | 67 70 78");
    expect(info.SITE_INFO.siteUrl).toBe("https://677078.xyz");
    expect(
      info.getSecuritySigningSecret(
        "test_secret_key_that_is_at_least_32_characters_long",
      ),
    ).toBe("test_secret_key_that_is_at_least_32_characters_long");
    expect(() => info.getSecuritySigningSecret("too_short")).toThrow();
  });
});
