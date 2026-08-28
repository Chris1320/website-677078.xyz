import type { APIRoute } from "astro";
import { eq, or } from "drizzle-orm";
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

export const GET: APIRoute = async (context) => {
  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Post ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const db = getDb();

    const post = await db
      .select()
      .from(posts)
      .where(or(eq(posts.id, id), eq(posts.slug, id)))
      .get();

    if (!post) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const postTagRows = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
      })
      .from(post_tags)
      .innerJoin(tags, eq(post_tags.tag_id, tags.id))
      .where(eq(post_tags.post_id, post.id))
      .all();

    return new Response(
      JSON.stringify({
        post: {
          ...post,
          tags: postTagRows,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to fetch post" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};

export const PUT: APIRoute = async (context) => {
  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Post ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const db = getDb();

    const existingPost = await db
      .select()
      .from(posts)
      .where(or(eq(posts.id, id), eq(posts.slug, id)))
      .get();

    if (!existingPost) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = (await context.request.json()) as any;
    const { title, description, content, status, tags: rawTags } = body || {};

    let updatedTitle = existingPost.title;
    if (typeof title === "string" && title.trim()) {
      updatedTitle = title.trim().slice(0, MAX_POST_TITLE_LENGTH);
    }

    let updatedSlug = existingPost.slug;
    if (typeof body.slug === "string" && body.slug.trim()) {
      const candidateSlug = slugify(body.slug).slice(0, MAX_POST_SLUG_LENGTH);
      if (candidateSlug !== existingPost.slug) {
        const slugCheck = await db
          .select()
          .from(posts)
          .where(eq(posts.slug, candidateSlug))
          .get();
        if (slugCheck && slugCheck.id !== existingPost.id) {
          updatedSlug = `${candidateSlug.slice(0, MAX_POST_SLUG_LENGTH - 10)}-${crypto.randomUUID().slice(0, 6)}`;
        } else {
          updatedSlug = candidateSlug;
        }
      }
    }

    let updatedDescription = existingPost.description;
    if (description !== undefined) {
      updatedDescription =
        description && typeof description === "string"
          ? String(description).trim().slice(0, MAX_POST_DESCRIPTION_LENGTH)
          : null;
    }

    let updatedContent = existingPost.content;
    if (typeof content === "string") {
      if (content.length > MAX_POST_CONTENT_LENGTH) {
        return new Response(
          JSON.stringify({
            error: `Content exceeds maximum size of ${MAX_POST_CONTENT_LENGTH / 1024 / 1024}MB`,
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      updatedContent = content;
    }

    let updatedStatus = existingPost.status;
    if (status !== undefined) {
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
      updatedStatus = status;
    }

    const now = new Date();
    let publishedAt = existingPost.published_at;
    if (
      body.updatePublishedDate === true ||
      (updatedStatus === "published" && !publishedAt)
    ) {
      publishedAt = now;
    } else if (updatedStatus === "draft" && body.unpublish === true) {
      publishedAt = null;
    }

    await db
      .update(posts)
      .set({
        title: updatedTitle,
        slug: updatedSlug,
        description: updatedDescription,
        content: updatedContent,
        status: updatedStatus,
        updated_at: now,
        published_at: publishedAt,
      })
      .where(eq(posts.id, existingPost.id));

    // Update tags if provided
    const attachedTags: { id: string; name: string; slug: string }[] = [];
    if (Array.isArray(rawTags)) {
      // Clear existing relations
      await db.delete(post_tags).where(eq(post_tags.post_id, existingPost.id));

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
            post_id: existingPost.id,
            tag_id: existingTag.id,
          })
          .onConflictDoNothing();

        attachedTags.push(existingTag);
      }
    }

    const updated = await db
      .select()
      .from(posts)
      .where(eq(posts.id, existingPost.id))
      .get();

    return new Response(
      JSON.stringify({
        post: {
          ...updated,
          tags: attachedTags,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to update post" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};

export const DELETE: APIRoute = async (context) => {
  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Post ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const db = getDb();

    const existingPost = await db
      .select()
      .from(posts)
      .where(or(eq(posts.id, id), eq(posts.slug, id)))
      .get();

    if (!existingPost) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    await db.delete(post_tags).where(eq(post_tags.post_id, existingPost.id));
    await db.delete(posts).where(eq(posts.id, existingPost.id));

    return new Response(
      JSON.stringify({
        success: true,
        deletedId: existingPost.id,
        deletedSlug: existingPost.slug,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to delete post" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
