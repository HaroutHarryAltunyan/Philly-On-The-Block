CREATE TABLE `coupons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`min_subtotal_cents` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_idx` ON `coupons` (`code`);--> statement-breakpoint
CREATE TABLE `menu_item_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`menu_item_id` integer NOT NULL,
	`name` text NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `menu_item_options_item_idx` ON `menu_item_options` (`menu_item_id`);--> statement-breakpoint
ALTER TABLE `menu_items` ADD `stock_qty` integer;--> statement-breakpoint
CREATE INDEX `menu_items_stock_idx` ON `menu_items` (`stock_qty`);--> statement-breakpoint
ALTER TABLE `orders` ADD `notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_fee_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `coupon_code` text DEFAULT '' NOT NULL;