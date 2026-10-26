ALTER TABLE messages ADD COLUMN in_reply_to TEXT;
CREATE UNIQUE INDEX messages_agent_reply_uidx ON messages(conversation_id,in_reply_to) WHERE in_reply_to IS NOT NULL;
ALTER TABLE outbox_events ADD COLUMN deferred_attempts INTEGER NOT NULL DEFAULT 0;
CREATE TABLE ai_provider_cooldowns (
 scope TEXT PRIMARY KEY NOT NULL,
 available_at TEXT NOT NULL,
 error_code TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
