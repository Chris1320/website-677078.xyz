import type { APIRoute } from "astro";
import { eq, or } from "drizzle-orm";
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

    const body = await context.request.json();
    const { title, description, content, status, tags: rawTags } = body;

    const updatedTitle =
      typeof title === "string" && title.trim()
        ? title.trim()
        : existingPost.title;
    let updatedSlug = existingPost.slug;
    if (typeof body.slug === "string" && body.slug.trim()) {
      const candidateSlug = slugify(body.slug);
      if (candidateSlug !== existingPost.slug) {
        const slugCheck = await db
          .select()
          .from(posts)
          .where(eq(posts.slug, candidateSlug))
          .get();
        if (slugCheck && slugCheck.id !== existingPost.id) {
          updatedSlug = `${candidateSlug}-${crypto.randomUUID().slice(0, 6)}`;
        } else {
          updatedSlug = candidateSlug;
        }
      }
    }

    const updatedDescription =
      description !== undefined
        ? description
          ? String(description).trim()
          : null
        : existingPost.description;
    const updatedContent =
      typeof content === "string" ? content : existingPost.content;
    const updatedStatus = status === "published" ? "published" : "draft";
    const now = new Date();

    let publishedAt = existingPost.published_at;
    if (updatedStatus === "published" && !publishedAt) {
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

    // Delete post_tags
    await db.delete(post_tags).where(eq(post_tags.post_id, existingPost.id));

    // Delete post
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
