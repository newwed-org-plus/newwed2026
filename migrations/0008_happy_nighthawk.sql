CREATE TABLE `whatsapp_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text,
	`name` text NOT NULL,
	`instructions` text NOT NULL,
	`model` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `whatsapp_instances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_agents_instance_id_unique` ON `whatsapp_agents` (`instance_id`);