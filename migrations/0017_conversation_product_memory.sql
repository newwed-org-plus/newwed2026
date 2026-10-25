CREATE TABLE conversation_product_memory (
 conversation_id TEXT PRIMARY KEY NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 focus_json TEXT NOT NULL,
 last_message_at TEXT NOT NULL,
 last_message_id TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
);
