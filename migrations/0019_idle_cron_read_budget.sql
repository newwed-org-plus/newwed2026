-- Maintenance must seek pending work, rather than scan the preserved transcript.
CREATE INDEX messages_sending_lease_idx ON messages(coalesce(send_started_at,created_at)) WHERE status='SENDING';
CREATE INDEX conversations_agent_lease_idx ON conversations(agent_processing_started_at) WHERE agent_processing_token IS NOT NULL;
CREATE INDEX outbox_commercial_watermark_idx ON outbox_events(processed_at) WHERE type NOT LIKE 'uazapi.%' AND processed_at IS NOT NULL;
