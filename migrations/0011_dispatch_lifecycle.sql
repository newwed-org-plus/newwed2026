ALTER TABLE outbox_events ADD dispatch_state TEXT DEFAULT 'PENDING' NOT NULL;
ALTER TABLE outbox_events ADD hold_reason TEXT;
ALTER TABLE outbox_events ADD processing_token TEXT;
ALTER TABLE outbox_events ADD processing_started_at TEXT;
ALTER TABLE outbox_events ADD processed_at TEXT;
ALTER TABLE outbox_events ADD processing_attempts INTEGER DEFAULT 0 NOT NULL;
CREATE INDEX outbox_dispatch_idx ON outbox_events(dispatch_state,next_attempt_at,created_at);
UPDATE outbox_events SET dispatch_state='HELD',hold_reason='PRE_ACTIVATION_REVIEW'
WHERE type IN ('conversation.manual.send','conversation.summarize','conversation.reply.requested','checkout.create','checkout.send','checkout.cancel','checkout.confirmation.send','notification.email');
ALTER TABLE messages ADD send_started_at TEXT;
ALTER TABLE notification_recipients ADD provider_message_id TEXT;
