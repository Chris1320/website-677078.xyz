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

/**
 * Scans media assets against other posts to determine which files will become true orphans.
 */
export async function findTrueOrphans(
  filenames: string[],
  currentPostId?: string | null,
): Promise<string[]> {
  if (!filenames || filenames.length === 0) return [];
  try {
    const res = await fetch("/api/admin/media/orphans");
    if (!res.ok) return [];
    const data: any = await res.json();
    const mediaList: Array<{
      filename: string;
      referenced_in?: Array<{ id: string }>;
    }> = data.media || [];

    return filenames.filter((filename) => {
      const item = mediaList.find((m) => m.filename === filename);
      if (!item) return false;
      const otherRefs = (item.referenced_in || []).filter(
        (p) => !currentPostId || p.id !== currentPostId,
      );
      return otherRefs.length === 0;
    });
  } catch (err) {
    console.error("Failed to detect true orphans:", err);
    return [];
  }
}

/**
 * Prunes a list of orphaned media assets.
 */
export async function pruneOrphanFiles(filenames: string[]): Promise<boolean> {
  if (!filenames || filenames.length === 0) return false;
  try {
    const res = await fetch("/api/admin/media/orphans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filenames }),
    });
    return res.ok;
  } catch (err) {
    console.error("Failed to prune orphan files:", err);
    return false;
  }
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

/**
 * Uploads a single media file to /api/media/upload with real-time XMLHttpRequest progress tracking.
 */
export function uploadFileWithProgress(
  file: File,
  preserveName: boolean = false,
  onProgress?: (progress: UploadProgress) => void,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media/upload");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / Math.max(1, e.total)) * 100);
        onProgress({ loaded: e.loaded, total: e.total, percent });
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data.error || `HTTP ${xhr.status}`));
        }
      } catch {
        reject(new Error("Invalid server response"));
      }
    };

    xhr.onerror = () =>
      reject(new Error("Network connection error during upload"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("preserveName", preserveName ? "true" : "false");
    xhr.send(formData);
  });
}

