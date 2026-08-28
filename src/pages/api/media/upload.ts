import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, getMediaBucket, media } from "../../../db";

export const prerender = false;

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

export async function computeSha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const POST: APIRoute = async (context) => {
  try {
    const db = getDb();
    const bucket = getMediaBucket();

    const formData = await context.request.formData();
    const file = formData.get("file");
    const preserveName = formData.get("preserveName") === "true";

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: "No valid file provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const hashHex = await computeSha256(arrayBuffer);
    const contentType = file.type || "application/octet-stream";
    const originalName = file.name;
    const ext = originalName.split(".").pop()?.toLowerCase() || "bin";

    // 1. Check for duplicate media via SHA-256 content hash
    const existingByHash = await db
      .select()
      .from(media)
      .where(eq(media.hash, hashHex))
      .get();

    if (existingByHash) {
      return new Response(
        JSON.stringify({
          id: existingByHash.id,
          filename: existingByHash.filename,
          url: `/media/${existingByHash.filename}`,
          originalName: existingByHash.original_name,
          mimeType: existingByHash.mime_type,
          sizeBytes: existingByHash.size_bytes,
          hash: existingByHash.hash,
          deduplicated: true,
          createdAt: existingByHash.created_at
            ? new Date(existingByHash.created_at).getTime()
            : Date.now(),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 2. Generate unique filename for new asset
    let filename = "";
    if (preserveName) {
      const sanitized = sanitizeFilename(originalName);
      const existingByName = await db
        .select()
        .from(media)
        .where(eq(media.filename, sanitized))
        .get();

      if (existingByName) {
        const randomSuffix = crypto.randomUUID().slice(0, 6);
        const namePart = sanitized.includes(".")
          ? sanitized.slice(0, sanitized.lastIndexOf("."))
          : sanitized;
        filename = `${namePart}-${randomSuffix}.${ext}`;
      } else {
        filename = sanitized;
      }
    } else {
      filename = `${crypto.randomUUID()}.${ext}`;
    }

    // 3. Write binary to R2
    await bucket.put(filename, arrayBuffer, {
      httpMetadata: {
        contentType,
      },
    });

    // 4. Record asset in D1 with content hash
    const mediaId = crypto.randomUUID();
    const now = new Date();

    await db.insert(media).values({
      id: mediaId,
      filename,
      original_name: originalName,
      mime_type: contentType,
      size_bytes: file.size,
      hash: hashHex,
      created_at: now,
    });

    return new Response(
      JSON.stringify({
        id: mediaId,
        filename,
        url: `/media/${filename}`,
        originalName,
        mimeType: contentType,
        sizeBytes: file.size,
        hash: hashHex,
        deduplicated: false,
        createdAt: now.getTime(),
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error?.message || "Failed to upload media asset",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
