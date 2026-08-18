CREATE TABLE `broadcasts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`coupon_code` text DEFAULT '' NOT NULL,
	`recipient_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`sent_at` integer,
	`created_at` integer NOT NULL
);
