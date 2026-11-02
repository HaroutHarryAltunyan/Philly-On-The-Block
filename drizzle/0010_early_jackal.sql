CREATE TABLE `revoked_sessions` (
	`jti` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `drivers` ADD `session_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `drivers` ADD `online` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `drivers` ADD `online_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_pin` text DEFAULT '' NOT NULL;