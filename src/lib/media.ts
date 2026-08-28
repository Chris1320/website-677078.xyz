import { EXTENSION_MIME_MAP } from "./info";

/**
 * Returns the MIME type for a given filename or file extension.
 */
export function getMimeTypeForExtension(filenameOrExt: string): string {
  const ext = filenameOrExt.split(".").pop()?.toLowerCase() || "";
  return EXTENSION_MIME_MAP[ext] || "application/octet-stream";
}

/**
 * Sanitizes an incoming original filename for storage.
 */
export function sanitizeFilename(originalName: string): string {
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

/**
 * Validates whether a filename contains illegal characters or path traversal sequences.
 */
export function isSafeFilename(filename: string): boolean {
  if (!filename || typeof filename !== "string") return false;
  if (
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("\0")
  ) {
    return false;
  }
  return true;
}

/**
 * Computes a hexadecimal SHA-256 hash string for an ArrayBuffer payload.
 */
export async function computeSha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
