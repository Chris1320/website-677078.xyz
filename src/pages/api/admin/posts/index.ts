import type { APIRoute } from "astro";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, posts, tags, post_tags } from "../../../../db";

export const prerender = false;

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "post"
  );
}

export const GET: APIRoute = async (context) => {
  try {
    const db = getDb();

    const allPosts = await db
      .select()
      .from(posts)
      .orderBy(desc(posts.updated_at))
      .all();

    if (allPosts.length === 0) {
      return new Response(JSON.stringify({ posts: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const postIds = allPosts.map((p) => p.id);
    const postTagRows = await db
      .select({
        postId: post_tags.post_id,
        tagId: tags.id,
        tagName: tags.name,
        tagSlug: tags.slug,
      })
      .from(post_tags)
      .innerJoin(tags, eq(post_tags.tag_id, tags.id))
      .where(inArray(post_tags.post_id, postIds))
      .all();

    const tagsByPostId: Record<
      string,
      { id: string; name: string; slug: string }[]
    > = {};
    for (const row of postTagRows) {
      if (!tagsByPostId[row.postId]) {
        tagsByPostId[row.postId] = [];
      }
      tagsByPostId[row.postId].push({
        id: row.tagId,
        name: row.tagName,
        slug: row.tagSlug,
      });
    }

    const result = allPosts.map((p) => ({
      ...p,
      tags: tagsByPostId[p.id] || [],
    }));

    return new Response(JSON.stringify({ posts: result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to list posts" }),
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

    const body = await context.request.json();
    const {
      title,
      description = "",
      content,
      status = "draft",
      tags: rawTags = [],
    } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return new Response(JSON.stringify({ error: "Title is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (content === undefined || typeof content !== "string") {
      return new Response(JSON.stringify({ error: "Content is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let slug = body.slug ? slugify(body.slug) : slugify(title);

    // Check slug collision
    const existingPost = await db
      .select()
      .from(posts)
      .where(eq(posts.slug, slug))
      .get();
    if (existingPost) {
      slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
    }

    const postId = crypto.randomUUID();
    const now = new Date();
    const isPublished = status === "published";

    await db.insert(posts).values({
      id: postId,
      slug,
      title: title.trim(),
      description: description.trim() || null,
      content,
      status: isPublished ? "published" : "draft",
      created_at: now,
      updated_at: now,
      published_at: isPublished ? now : null,
    });

    // Handle tags
    const attachedTags: { id: string; name: string; slug: string }[] = [];
    if (Array.isArray(rawTags)) {
      for (const rawTagName of rawTags) {
        if (typeof rawTagName !== "string" || !rawTagName.trim()) continue;
        const tagName = rawTagName.trim();
        const tagSlug = slugify(tagName);

        let existingTag = await db
          .select()
          .from(tags)
          .where(eq(tags.slug, tagSlug))
          .get();
        if (!existingTag) {
          const newTagId = crypto.randomUUID();
          await db.insert(tags).values({
            id: newTagId,
            name: tagName,
            slug: tagSlug,
            created_at: now,
          });
          existingTag = {
            id: newTagId,
            name: tagName,
            slug: tagSlug,
            created_at: now,
          };
        }

        await db
          .insert(post_tags)
          .values({
            post_id: postId,
            tag_id: existingTag.id,
          })
          .onConflictDoNothing();

        attachedTags.push(existingTag);
      }
    }

    const createdPost = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .get();

    return new Response(
      JSON.stringify({
        post: {
          ...createdPost,
          tags: attachedTags,
        },
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to create post" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
