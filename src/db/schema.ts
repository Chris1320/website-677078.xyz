import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    content: text("content").notNull(),
    content_html: text("content_html"),
    status: text("status", { enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    published_at: integer("published_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("posts_status_published_at_idx").on(t.status, t.published_at),
    index("posts_updated_at_idx").on(t.updated_at),
  ],
);

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const post_tags = sqliteTable(
  "post_tags",
  {
    post_id: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tag_id: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.post_id, t.tag_id] }),
    index("post_tags_tag_id_idx").on(t.tag_id),
  ],
);

export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    filename: text("filename").notNull().unique(),
    mime_type: text("mime_type").notNull(),
    size_bytes: integer("size_bytes").notNull(),
    hash: text("hash"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("media_hash_idx").on(t.hash),
    index("media_created_at_idx").on(t.created_at),
  ],
);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  totp_secret: text("totp_secret"),
  totp_enabled: integer("totp_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const postsRelations = relations(posts, ({ many }) => ({
  post_tags: many(post_tags),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  post_tags: many(post_tags),
}));

export const postTagsRelations = relations(post_tags, ({ one }) => ({
  post: one(posts, {
    fields: [post_tags.post_id],
    references: [posts.id],
  }),
  tag: one(tags, {
    fields: [post_tags.tag_id],
    references: [tags.id],
  }),
}));

export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;
export type Media = typeof media.$inferSelect;
export type InsertMedia = typeof media.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
