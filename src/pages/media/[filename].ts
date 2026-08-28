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
    const object = await bucket.get(filename, {
      onlyIf: context.request.headers,
      range: context.request.headers,
    });

    if (!object) {
      return new Response("Asset not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Accept-Ranges", "bytes");

    // Check if object is a metadata-only R2Object (precondition matched, e.g. If-None-Match)
    if (!("body" in object) || !(object as any).body) {
      return new Response(null, {
        status: 304,
        headers,
      });
    }

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

    const isRange = Boolean(object.range);
    if (isRange && object.range) {
      const range = object.range as any;
      if (typeof range.offset === "number" && typeof range.length === "number") {
        headers.set(
          "Content-Range",
          `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`,
        );
      } else if (typeof range.suffix === "number") {
        headers.set(
          "Content-Range",
          `bytes ${object.size - range.suffix}-${object.size - 1}/${object.size}`,
        );
      }
    }

    return new Response(object.body, {
      status: isRange ? 206 : 200,
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
