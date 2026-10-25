CREATE TABLE operation_leases (
  id TEXT PRIMARY KEY NOT NULL,
  token TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE history_imports (
  external_id TEXT PRIMARY KEY NOT NULL,
  line_id TEXT NOT NULL,
  cursor INTEGER DEFAULT 0 NOT NULL,
  attempts INTEGER DEFAULT 0 NOT NULL,
  next_attempt_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX history_imports_pending_idx ON history_imports(completed_at,next_attempt_at,updated_at);
