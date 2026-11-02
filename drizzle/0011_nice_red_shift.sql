CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor` text NOT NULL,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`target` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `delivery_offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`driver_id` integer NOT NULL,
	`status` text DEFAULT 'offered' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `delivery_offers_order_idx` ON `delivery_offers` (`order_id`);--> statement-breakpoint
CREATE INDEX `delivery_offers_driver_idx` ON `delivery_offers` (`driver_id`);--> statement-breakpoint
CREATE TABLE `push_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`driver_id` integer,
	`phone_key` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_tokens_kind_idx` ON `push_tokens` (`kind`);--> statement-breakpoint
CREATE TABLE `staff_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'kitchen' NOT NULL,
	`totp_secret` text DEFAULT '' NOT NULL,
	`totp_pending` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_users_username_idx` ON `staff_users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `delivery_offers_live_order_idx` ON `delivery_offers` (`order_id`) WHERE status = 'offered';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `delivery_offers_live_driver_idx` ON `delivery_offers` (`driver_id`) WHERE status = 'offered';
