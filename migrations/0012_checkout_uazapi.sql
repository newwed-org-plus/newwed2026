ALTER TABLE checkouts ADD conversation_id TEXT REFERENCES conversations(id);
ALTER TABLE checkouts ADD whatsapp_instance_id TEXT REFERENCES whatsapp_instances(id);
ALTER TABLE checkouts ADD delivery_channel TEXT DEFAULT 'meta' NOT NULL;
CREATE INDEX checkouts_conversation_idx ON checkouts(conversation_id);
