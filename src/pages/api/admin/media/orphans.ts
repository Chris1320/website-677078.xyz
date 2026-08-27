import type { APIRoute } from "astro";
import { desc, inArray } from "drizzle-orm";
import { getDb, getMediaBucket, media, posts } from "../../../../db";
import { extractMediaReferences } from "../../../../lib/markdown";

export const prerender = false;

interface MediaUsage {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: number;
  is_orphan: boolean;
  referenced_in: { id: string; title: string; slug: string }[];
}

export const GET: APIRoute = async () => {
  try {
    const db = getDb();

    const [allMedia, allPosts] = await Promise.all([
      db.select().from(media).orderBy(desc(media.created_at)).all(),
      db
        .select({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          content: posts.content,
        })
        .from(posts)
        .all(),
    ]);

    const referencesByFilename: Record<
      string,
      { id: string; title: string; slug: string }[]
    > = {};

    for (const post of allPosts) {
      const referencedFiles = extractMediaReferences(post.content);
      for (const filename of referencedFiles) {
        if (!referencesByFilename[filename]) {
          referencesByFilename[filename] = [];
        }
        referencesByFilename[filename].push({
          id: post.id,
          title: post.title,
          slug: post.slug,
        });
      }
    }

    let orphanCount = 0;
    let inUseCount = 0;

    const enrichedMedia: MediaUsage[] = allMedia.map((asset) => {
      const refs = referencesByFilename[asset.filename] || [];
      const isOrphan = refs.length === 0;

      if (isOrphan) {
        orphanCount++;
      } else {
        inUseCount++;
      }

      return {
        id: asset.id,
        filename: asset.filename,
        original_name: asset.original_name,
        mime_type: asset.mime_type,
        size_bytes: asset.size_bytes,
        created_at: asset.created_at.getTime(),
        is_orphan: isOrphan,
        referenced_in: refs,
      };
    });

    return new Response(
      JSON.stringify({
        totalMedia: allMedia.length,
        orphanCount,
        inUseCount,
        media: enrichedMedia,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error?.message || "Failed to scan media assets",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const db = getDb();
    const bucket = getMediaBucket();

    const body = (await context.request.json()) as any;
    const { filenames = [], allOrphans = false } = body || {};

    // Scan all posts to verify which files are truly unreferenced
    const allPosts = await db
      .select({ content: posts.content })
      .from(posts)
      .all();
    const activeReferences = new Set<string>();
    for (const post of allPosts) {
      const refs = extractMediaReferences(post.content);
      for (const ref of refs) {
        activeReferences.add(ref);
      }
    }

    const allMedia = await db.select().from(media).all();

    let targetMedia: typeof allMedia = [];
    if (allOrphans) {
      targetMedia = allMedia.filter((m) => !activeReferences.has(m.filename));
    } else if (Array.isArray(filenames) && filenames.length > 0) {
      const requestedSet = new Set(filenames);
      // Strictly prevent deleting files that are currently in use
      targetMedia = allMedia.filter(
        (m) =>
          requestedSet.has(m.filename) && !activeReferences.has(m.filename),
      );
    }

    if (targetMedia.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No unreferenced media assets found to delete",
          deleted: [],
          count: 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const deletedFilenames: string[] = [];
    const mediaIdsToDelete: string[] = [];

    for (const asset of targetMedia) {
      try {
        await bucket.delete(asset.filename);
        deletedFilenames.push(asset.filename);
        mediaIdsToDelete.push(asset.id);
      } catch (delErr) {
        console.error(`Failed to delete ${asset.filename} from R2:`, delErr);
      }
    }

    if (mediaIdsToDelete.length > 0) {
      await db.delete(media).where(inArray(media.id, mediaIdsToDelete));
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted: deletedFilenames,
        count: deletedFilenames.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error?.message || "Failed to prune orphaned media",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
