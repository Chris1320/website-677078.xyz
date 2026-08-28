CREATE INDEX `media_hash_idx` ON `media` (`hash`);--> statement-breakpoint
CREATE INDEX `media_created_at_idx` ON `media` (`created_at`);--> statement-breakpoint
CREATE INDEX `post_tags_tag_id_idx` ON `post_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `posts_status_published_at_idx` ON `posts` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `posts_updated_at_idx` ON `posts` (`updated_at`);