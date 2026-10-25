ALTER TABLE messages ADD COLUMN sent_at TEXT;
ALTER TABLE messages ADD COLUMN delivered_at TEXT;
ALTER TABLE messages ADD COLUMN read_at TEXT;
ALTER TABLE messages ADD COLUMN status_updated_at TEXT;
ALTER TABLE messages ADD COLUMN status_checked_at TEXT;
ALTER TABLE messages ADD COLUMN status_check_error TEXT;
CREATE INDEX messages_delivery_poll_idx ON messages(status_checked_at,created_at)
 WHERE direction='OUT' AND status IN ('ACCEPTED','SENT','DELIVERED','SEND_UNKNOWN');
