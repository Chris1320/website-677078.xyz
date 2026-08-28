export const SITE_INFO = {
  title: "CFN | 67 70 78",
  description: "ChrisFromNowhere's personal blog",
  author: "ChrisFromNowhere",
  siteUrl: "https://677078.xyz",
} as const;

export const ALLOWED_MEDIA_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "avif",
  "svg",
  "mp4",
  "webm",
  "ogv",
  "mov",
  "mp3",
  "wav",
  "ogg",
  "aac",
  "flac",
  "m4a",
  "pdf",
]);

export const ALLOWED_MEDIA_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/mp4",
  "audio/x-m4a",
  "application/pdf",
]);

export const EXTENSION_MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  mp4: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  pdf: "application/pdf",
};

export const POSTS_PAGE_SIZE = 10;
export const MEDIA_PAGE_SIZE = 12;

export const HOMEPAGE_RECENT_POSTS_LIMIT = 5;

export const MAX_POST_TITLE_LENGTH = 500;
export const MAX_POST_DESCRIPTION_LENGTH = 2000;
export const MAX_POST_CONTENT_LENGTH = 5_000_000; // 1000000 == 1 MB
export const MAX_POST_SLUG_LENGTH = 200;
export const MAX_POST_TAGS_COUNT = 30;
export const MAX_POST_TAG_NAME_LENGTH = 60;

export const MAX_MEDIA_FILE_SIZE = 25 * 1024 * 1024; // in MB

export const SECURITY_SIGNING_SECRET = import.meta.env.SECURITY_SIGNING_SECRET;
export const SECURITY_PBKDF2_ITERATIONS = 100_000;
export const SECURITY_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
