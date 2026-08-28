import type { APIRoute } from "astro";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, posts, tags, post_tags } from "../../../../db";
import { slugify } from "../../../../lib/utils";
import {
  MAX_POST_TITLE_LENGTH,
  MAX_POST_DESCRIPTION_LENGTH,
  MAX_POST_CONTENT_LENGTH,
  MAX_POST_SLUG_LENGTH,
  MAX_POST_TAGS_COUNT,
  MAX_POST_TAG_NAME_LENGTH,
} from "../../../../lib/info";

export const prerender = false;

export const GET: APIRoute = async () => {
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

    const body = (await context.request.json()) as any;
    const {
      title,
      description = "",
      content,
      status = "draft",
      tags: rawTags = [],
    } = body || {};

    if (!title || typeof title !== "string" || !title.trim()) {
      return new Response(JSON.stringify({ error: "Title is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (title.length > MAX_POST_TITLE_LENGTH) {
      return new Response(
        JSON.stringify({
          error: `Title exceeds maximum length of ${MAX_POST_TITLE_LENGTH} characters`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (content === undefined || typeof content !== "string") {
      return new Response(JSON.stringify({ error: "Content is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (content.length > MAX_POST_CONTENT_LENGTH) {
      return new Response(
        JSON.stringify({ error: "Content exceeds maximum allowed size" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (status !== "draft" && status !== "published") {
      return new Response(
        JSON.stringify({
          error: "Invalid status. Must be 'draft' or 'published'.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let slug = body.slug ? slugify(body.slug) : slugify(title);
    if (slug.length > MAX_POST_SLUG_LENGTH) {
      slug = slug.slice(0, MAX_POST_SLUG_LENGTH);
    }

    // Check slug collision
    const existingPost = await db
      .select()
      .from(posts)
      .where(eq(posts.slug, slug))
      .get();
    if (existingPost) {
      slug = `${slug.slice(0, MAX_POST_SLUG_LENGTH - 10)}-${crypto.randomUUID().slice(0, 6)}`;
    }

    const postId = crypto.randomUUID();
    const now = new Date();
    const isPublished = status === "published";

    const cleanDescription =
      typeof description === "string"
        ? description.trim().slice(0, MAX_POST_DESCRIPTION_LENGTH)
        : null;

    await db.insert(posts).values({
      id: postId,
      slug,
      title: title.trim(),
      description: cleanDescription,
      content,
      status: isPublished ? "published" : "draft",
      created_at: now,
      updated_at: now,
      published_at: isPublished ? now : null,
    });

    // Handle tags with limits and validation
    const attachedTags: { id: string; name: string; slug: string }[] = [];
    if (Array.isArray(rawTags)) {
      const sanitizedTagList = rawTags.slice(0, MAX_POST_TAGS_COUNT);
      for (const rawTagName of sanitizedTagList) {
        if (typeof rawTagName !== "string" || !rawTagName.trim()) continue;
        const tagName = rawTagName.trim().slice(0, MAX_POST_TAG_NAME_LENGTH);
        const tagSlug = slugify(tagName).slice(0, MAX_POST_TAG_NAME_LENGTH);

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
