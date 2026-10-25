CREATE TABLE operational_health (
 service TEXT PRIMARY KEY NOT NULL,
 last_started_at TEXT,
 last_completed_at TEXT,
 last_success_at TEXT,
 last_error_code TEXT,
 pending INTEGER NOT NULL DEFAULT 0,
 oldest_pending_at TEXT,
 watermark TEXT,
 failures INTEGER NOT NULL DEFAULT 0,
 stalled_runs INTEGER NOT NULL DEFAULT 0,
 failure_streak INTEGER NOT NULL DEFAULT 0,
 peak_pending INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE resource_usage (
 resource TEXT PRIMARY KEY NOT NULL,
 window_start TEXT NOT NULL,
 window_end TEXT NOT NULL,
 used INTEGER NOT NULL,
 budget INTEGER,
 observed_at TEXT NOT NULL,
 oldest_item_at TEXT,
 source TEXT NOT NULL
);
CREATE INDEX webhook_operations_idx ON webhook_events(provider,processed_at,attempts,created_at);
CREATE INDEX outbox_operations_idx ON outbox_events(dispatch_state,type,created_at);
CREATE INDEX outbox_completed_idx ON outbox_events(processed_at) WHERE processed_at IS NOT NULL;
