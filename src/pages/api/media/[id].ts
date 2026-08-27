import type { APIRoute } from "astro";
import { eq, or } from "drizzle-orm";
import { getDb, getMediaBucket, media } from "../../../db";

export const prerender = false;

export const DELETE: APIRoute = async (context) => {
  const { id } = context.params;

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Asset identifier is required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const runtimeEnv = (context.locals as any).runtime?.env;
    const db = getDb(runtimeEnv);
    const bucket = getMediaBucket(runtimeEnv);

    const asset = await db
      .select()
      .from(media)
      .where(or(eq(media.id, id), eq(media.filename, id)))
      .get();

    if (!asset) {
      return new Response(JSON.stringify({ error: "Asset not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Delete from R2 storage
    await bucket.delete(asset.filename);

    // Delete record from D1
    await db.delete(media).where(eq(media.id, asset.id));

    return new Response(
      JSON.stringify({
        success: true,
        deletedId: asset.id,
        deletedFilename: asset.filename,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to delete asset" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
