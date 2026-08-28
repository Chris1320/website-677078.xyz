import type { APIRoute } from "astro";
import { getMediaBucket } from "../../db";
import { isSafeFilename, getMimeTypeForExtension } from "../../lib/media";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const { filename } = context.params;

  if (!filename || !isSafeFilename(filename)) {
    return new Response("Invalid filename parameter", { status: 400 });
  }

  try {
    const bucket = getMediaBucket();
    const object = await bucket.get(filename);

    if (!object) {
      return new Response("Asset not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("X-Content-Type-Options", "nosniff");

    if (!headers.get("Content-Type")) {
      headers.set("Content-Type", getMimeTypeForExtension(filename));
    }

    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const contentType = headers.get("Content-Type") || "";

    // Sandbox SVGs and potentially dangerous active web formats
    if (ext === "svg" || contentType === "image/svg+xml") {
      headers.set(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      );
    } else if (
      ext === "html" ||
      ext === "htm" ||
      ext === "xhtml" ||
      contentType.includes("text/html")
    ) {
      headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
      headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    }

    return new Response(object.body, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    return new Response(
      `Error fetching asset: ${error?.message || "Unknown error"}`,
      {
        status: 500,
      },
    );
  }
};
