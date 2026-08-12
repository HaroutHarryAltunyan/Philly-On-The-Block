ALTER TABLE `orders` ADD `dest_lat` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `dest_lng` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `driver_lat` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `driver_lng` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `driver_updated_at` integer;