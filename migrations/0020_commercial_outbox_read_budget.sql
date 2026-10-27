-- Preserve imported UAZAPI evidence without scanning it in commercial maintenance.
CREATE INDEX outbox_commercial_dispatch_idx ON outbox_events(dispatch_state,created_at,type) WHERE type NOT LIKE 'uazapi.%';
