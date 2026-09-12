CREATE TABLE `animation_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`asset_id` text NOT NULL,
	`source_revision_id` text NOT NULL,
	`name` text NOT NULL,
	`object_key` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`reviewed` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `animation_owner_asset` ON `animation_sets` (`owner`,`asset_id`);