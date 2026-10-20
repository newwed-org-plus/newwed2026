CREATE TABLE `whatsapp_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text DEFAULT 'uazapi' NOT NULL,
	`state` text DEFAULT 'disconnected' NOT NULL,
	`phone` text,
	`profile_name` text,
	`last_error` text,
	`operation_token` text,
	`operation_started_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `conversations` ADD `whatsapp_instance_id` text REFERENCES whatsapp_instances(id);--> statement-breakpoint
ALTER TABLE `conversations` ADD `contact_phone` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `contact_name` text;