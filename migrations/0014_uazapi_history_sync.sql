CREATE TABLE uazapi_history_syncs (
 id TEXT PRIMARY KEY NOT NULL,
 line_id TEXT NOT NULL REFERENCES whatsapp_instances(id),
 status TEXT NOT NULL DEFAULT 'PENDING',
 provider_offset INTEGER NOT NULL DEFAULT 0,
 scanned_count INTEGER NOT NULL DEFAULT 0,
 skipped_count INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TEXT,
 last_error TEXT,
 requested_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 completed_at TEXT
);
CREATE UNIQUE INDEX uazapi_history_active_idx ON uazapi_history_syncs(line_id) WHERE status IN ('PENDING','RUNNING');
CREATE INDEX uazapi_history_pending_idx ON uazapi_history_syncs(status,next_attempt_at,updated_at);
