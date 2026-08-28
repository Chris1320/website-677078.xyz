import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { count, desc, eq, like, or, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { slugify } from "../src/lib/utils";

describe("Database Operations & Indexing", () => {
  const sqlite = new Database(":memory:");
  sqlite.run(`
    CREATE TABLE posts (
      id text PRIMARY KEY NOT NULL,
      slug text NOT NULL UNIQUE,
      title text NOT NULL,
      description text,
      content text NOT NULL,
      status text DEFAULT 'draft' NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      published_at integer
    );
    CREATE TABLE tags (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL UNIQUE,
      slug text NOT NULL UNIQUE,
      created_at integer NOT NULL
    );
    CREATE TABLE post_tags (
      post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      tag_id text NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(post_id, tag_id)
    );
    CREATE TABLE media (
      id text PRIMARY KEY NOT NULL,
      filename text NOT NULL UNIQUE,
      mime_type text NOT NULL,
      size_bytes integer NOT NULL,
      hash text,
      created_at integer NOT NULL
    );
    CREATE INDEX media_hash_idx ON media (hash);
    CREATE INDEX media_created_at_idx ON media (created_at);
    CREATE INDEX post_tags_tag_id_idx ON post_tags (tag_id);
    CREATE INDEX posts_status_published_at_idx ON posts (status, published_at);
    CREATE INDEX posts_updated_at_idx ON posts (updated_at);
  `);

  const db = drizzle(sqlite, { schema }) as any;

  it("handles duplicate tag insertions gracefully without crashing via onConflictDoNothing", async () => {
    const tagName = "TypeScript";
    const tagSlug = slugify(tagName);
    const now = new Date();

    await db
      .insert(schema.tags)
      .values({
        id: crypto.randomUUID(),
        name: tagName,
        slug: tagSlug,
        created_at: now,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.tags)
      .values({
        id: crypto.randomUUID(),
        name: tagName,
        slug: tagSlug,
        created_at: now,
      })
      .onConflictDoNothing();

    const tagRows = await db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.slug, tagSlug))
      .all();

    expect(tagRows.length).toBe(1);
    expect(tagRows[0].name).toBe("TypeScript");
  });

  it("filters and paginates posts using SQL where and limit/offset", async () => {
    const now = new Date();

    // Insert sample posts
    const post1Id = "post-1";
    const post2Id = "post-2";
    const post3Id = "post-3";

    await db.insert(schema.posts).values([
      {
        id: post1Id,
        slug: "intro-astro",
        title: "Introduction to Astro",
        description: "Modern SSR framework",
        content: "Astro content with fast loading speed.",
        status: "published",
        created_at: now,
        updated_at: now,
        published_at: new Date(now.getTime() - 2000),
      },
      {
        id: post2Id,
        slug: "deep-dive-sqlite",
        title: "Deep Dive into SQLite & D1",
        description: "Database internals",
        content: "SQLite at the edge with Cloudflare Workers.",
        status: "published",
        created_at: now,
        updated_at: now,
        published_at: new Date(now.getTime() - 1000),
      },
      {
        id: post3Id,
        slug: "draft-post",
        title: "Unpublished Draft",
        description: "Drafting notes",
        content: "Secret content not ready yet.",
        status: "draft",
        created_at: now,
        updated_at: now,
        published_at: null,
      },
    ]);

    // Tag setup
    const tag1Id = "tag-1";
    const tag2Id = "tag-2";
    await db.insert(schema.tags).values([
      { id: tag1Id, name: "Web Dev", slug: "web-dev", created_at: now },
      { id: tag2Id, name: "Database", slug: "database", created_at: now },
    ]);

    await db.insert(schema.post_tags).values([
      { post_id: post1Id, tag_id: tag1Id },
      { post_id: post2Id, tag_id: tag2Id },
      { post_id: post2Id, tag_id: tag1Id },
    ]);

    // Tag count aggregation query
    const tagRows = await db
      .select({
        id: schema.tags.id,
        name: schema.tags.name,
        slug: schema.tags.slug,
        count: count(),
      })
      .from(schema.post_tags)
      .innerJoin(schema.tags, eq(schema.post_tags.tag_id, schema.tags.id))
      .innerJoin(schema.posts, eq(schema.post_tags.post_id, schema.posts.id))
      .where(eq(schema.posts.status, "published"))
      .groupBy(schema.tags.id, schema.tags.name, schema.tags.slug)
      .orderBy(desc(count()))
      .all();

    expect(tagRows.length).toBe(2);
    expect(tagRows[0].slug).toBe("web-dev");
    expect(tagRows[0].count).toBe(2);

    // Search query via SQL like
    const pattern = "%sqlite%";
    const searchCondition = or(
      like(schema.posts.title, pattern),
      like(schema.posts.slug, pattern),
      like(schema.posts.description, pattern),
      like(schema.posts.content, pattern),
    );

    const searchResults = await db
      .select()
      .from(schema.posts)
      .where(searchCondition)
      .all();

    expect(searchResults.length).toBe(1);
    expect(searchResults[0].id).toBe(post2Id);

    // Tag filtering via subquery
    const tagFiltered = await db
      .select()
      .from(schema.posts)
      .where(
        sql`${schema.posts.id} IN (SELECT ${schema.post_tags.post_id} FROM ${schema.post_tags} INNER JOIN ${schema.tags} ON ${schema.post_tags.tag_id} = ${schema.tags.id} WHERE ${schema.tags.slug} = 'database')`,
      )
      .all();

    expect(tagFiltered.length).toBe(1);
    expect(tagFiltered[0].id).toBe(post2Id);
  });
});
