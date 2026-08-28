import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, getMediaBucket, media } from "../../../db";
import { MAX_MEDIA_FILE_SIZE } from "../../../lib/info";
import { sanitizeFilename, computeSha256 } from "../../../lib/media";

export const prerender = false;

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

    if (file.size > MAX_MEDIA_FILE_SIZE) {
      return new Response(
        JSON.stringify({
          error: `File size exceeds limit of ${MAX_MEDIA_FILE_SIZE / 1024 / 1024}MB`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const originalName = file.name;
    const ext = originalName.split(".").pop()?.toLowerCase() || "";

    // NOTE: I disabled extension and MIMETYPE validation because I am the only
    // one (admin) uploading files and I want to be able to upload any filetype.
    // TODO: Making this a setting is a good idea. Though I'm lazy today.
    //
    // if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    //   return new Response(
    //     JSON.stringify({
    //       error: `Disallowed file type (.${ext || "unknown"}). Allowed types: images, videos, audio, and PDF documents.`,
    //     }),
    //     {
    //       status: 400,
    //       headers: { "Content-Type": "application/json" },
    //     },
    //   );
    // }

    const contentType = file.type || "application/octet-stream";

    // if (
    //   contentType !== "application/octet-stream" &&
    //   !ALLOWED_MIME_TYPES.has(contentType)
    // ) {
    //   return new Response(
    //     JSON.stringify({
    //       error: `Invalid MIME type (${contentType}).`,
    //     }),
    //     {
    //       status: 400,
    //       headers: { "Content-Type": "application/json" },
    //     },
    //   );
    // }

    const arrayBuffer = await file.arrayBuffer();
    const hashHex = await computeSha256(arrayBuffer);

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
