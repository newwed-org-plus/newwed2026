CREATE TABLE public_checkout_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  price_batch_id TEXT NOT NULL REFERENCES price_batches(id),
  amount_cents INTEGER NOT NULL,
  installment_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  provider_id TEXT UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX public_checkout_unissued_expiry_idx ON public_checkout_sessions(expires_at)
  WHERE status IN ('QUEUED','SUBMITTING') AND provider_id IS NULL;
