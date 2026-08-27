import type { APIRoute } from "astro";
import { getMediaBucket } from "../../db";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const { filename } = context.params;

  if (!filename) {
    return new Response("Filename parameter is required", { status: 400 });
  }

  try {
    const runtimeEnv = (context.locals as any).runtime?.env;
    const bucket = getMediaBucket(runtimeEnv);
    const object = await bucket.get(filename);

    if (!object) {
      return new Response("Asset not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    if (!headers.get("Content-Type")) {
      const ext = filename.split(".").pop()?.toLowerCase();
      const contentTypes: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        avif: "image/avif",
        mp4: "video/mp4",
        webm: "video/webm",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        pdf: "application/pdf",
      };
      if (ext && contentTypes[ext]) {
        headers.set("Content-Type", contentTypes[ext]);
      } else {
        headers.set("Content-Type", "application/octet-stream");
      }
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
