CREATE TABLE `subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscribers_email_idx` ON `subscribers` (`email`);--> statement-breakpoint
ALTER TABLE `orders` ADD `phone_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `points_earned` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `points_redeemed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `points_discount_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `orders_phone_key_idx` ON `orders` (`phone_key`);