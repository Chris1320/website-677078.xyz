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

    const originalName = file.name;
    const ext = originalName.split(".").pop()?.toLowerCase() || "bin";
    let filename = "";

    if (preserveName) {
      const sanitized = sanitizeFilename(originalName);
      const existing = await db
        .select()
        .from(media)
        .where(eq(media.filename, sanitized))
        .get();

      if (existing) {
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

    const arrayBuffer = await file.arrayBuffer();
    const contentType = file.type || "application/octet-stream";

    await bucket.put(filename, arrayBuffer, {
      httpMetadata: {
        contentType,
      },
    });

    const mediaId = crypto.randomUUID();
    const now = new Date();

    await db.insert(media).values({
      id: mediaId,
      filename,
      original_name: originalName,
      mime_type: contentType,
      size_bytes: file.size,
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
