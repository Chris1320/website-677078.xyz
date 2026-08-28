import type { APIRoute } from "astro";
import { eq, or, like } from "drizzle-orm";
import { getDb, getMediaBucket, media, posts } from "../../../../db";
import {
  sanitizeFilename,
  isSafeFilename,
  getMimeTypeForExtension,
} from "../../../../lib/media";
import {
  replaceMediaReferences,
  extractMediaReferences,
} from "../../../../lib/markdown";

export const prerender = false;

export const PATCH: APIRoute = async (context) => {
  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Asset ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const db = getDb();
    const bucket = getMediaBucket();

    const body = (await context.request.json()) as any;
    const { newFilename } = body || {};

    if (
      !newFilename ||
      typeof newFilename !== "string" ||
      !newFilename.trim()
    ) {
      return new Response(
        JSON.stringify({ error: "A valid new filename is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const existingAsset = await db
      .select()
      .from(media)
      .where(or(eq(media.id, id), eq(media.filename, id)))
      .get();

    if (!existingAsset) {
      return new Response(JSON.stringify({ error: "Media asset not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const currentFilename = existingAsset.filename;

    const oldExt = currentFilename.split(".").pop()?.toLowerCase() || "";
    let cleanNewFilename = sanitizeFilename(newFilename.trim());

    if (!cleanNewFilename.includes(".") && oldExt) {
      cleanNewFilename = `${cleanNewFilename}.${oldExt}`;
    }

    if (!isSafeFilename(cleanNewFilename)) {
      return new Response(
        JSON.stringify({ error: "Invalid or unsafe filename." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (cleanNewFilename === currentFilename) {
      return new Response(
        JSON.stringify({
          success: true,
          asset: existingAsset,
          updatedPostsCount: 0,
          message: "Filename unchanged.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check conflict with existing media
    const conflict = await db
      .select()
      .from(media)
      .where(eq(media.filename, cleanNewFilename))
      .get();

    if (conflict && conflict.id !== existingAsset.id) {
      return new Response(
        JSON.stringify({
          error: `A media asset named "${cleanNewFilename}" already exists.`,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // Rename in object store
    try {
      const oldObj = await bucket.get(currentFilename);
      if (oldObj) {
        await bucket.put(cleanNewFilename, oldObj.body, {
          httpMetadata: oldObj.httpMetadata,
          customMetadata: oldObj.customMetadata,
        });
        await bucket.delete(currentFilename);
      }
    } catch (bucketErr) {
      console.error("Failed to copy/delete asset in bucket:", bucketErr);
    }

    const newMimeType =
      getMimeTypeForExtension(cleanNewFilename) || existingAsset.mime_type;

    // Update media table record
    await db
      .update(media)
      .set({
        filename: cleanNewFilename,
        mime_type: newMimeType,
      })
      .where(eq(media.id, existingAsset.id));

    // Only query candidate posts that contain the target filename via SQL filter
    const candidatePosts = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        content: posts.content,
      })
      .from(posts)
      .where(like(posts.content, `%${currentFilename}%`))
      .all();

    let updatedPostsCount = 0;
    const affectedPosts: { id: string; title: string; slug: string }[] = [];

    for (const post of candidatePosts) {
      const refs = extractMediaReferences(post.content || "");
      if (refs.includes(currentFilename)) {
        const newContent = replaceMediaReferences(
          post.content || "",
          currentFilename,
          cleanNewFilename,
        );

        if (newContent !== post.content) {
          await db
            .update(posts)
            .set({
              content: newContent,
              updated_at: new Date(),
            })
            .where(eq(posts.id, post.id));

          updatedPostsCount++;
          affectedPosts.push({
            id: post.id,
            title: post.title,
            slug: post.slug,
          });
        }
      }
    }

    const updatedAsset = {
      ...existingAsset,
      filename: cleanNewFilename,
      mime_type: newMimeType,
    };

    return new Response(
      JSON.stringify({
        success: true,
        asset: updatedAsset,
        updatedPostsCount,
        affectedPosts,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error?.message || "Failed to rename media asset",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};

export const PUT: APIRoute = PATCH;
