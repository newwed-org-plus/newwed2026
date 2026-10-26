-- Fixtures exclusivamente locais. Nenhuma linha ou destinatário externo autorizado.
INSERT OR IGNORE INTO editions(id,slug,name,destination,starts_at,ends_at,status,capacity,created_at,updated_at)
VALUES('validacao-local-edition','validacao-local','VALIDACAO local — demonstração','Recife','2027-03-01','2027-03-03','OPEN',8,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT OR IGNORE INTO availability(edition_id,reserved,sold,updated_at) VALUES('validacao-local-edition',0,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT OR IGNORE INTO price_batches(id,edition_id,name,amount_cents,installment_count,active,created_at,updated_at)
VALUES('validacao-local-price','validacao-local-edition','VALIDACAO local',120000,3,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT OR IGNORE INTO leads(id,name,email,normalized_email,phone,normalized_phone,edition_id,stage,consent_version,consent_at,dedupe_key,created_at,updated_at)
VALUES('validacao-local-lead','VALIDACAO local — contato sintético','demo@example.invalid','demo@example.invalid','81000000001','+5581000000001','validacao-local-edition','QUALIFICADO','fixture-local',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'validacao-local-lead',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT OR IGNORE INTO whatsapp_instances(id,name,state,created_at,updated_at)
VALUES('validacao-local','VALIDACAO local — sem provider','disconnected',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT OR IGNORE INTO conversations(id,lead_id,channel,external_id,whatsapp_instance_id,contact_phone,contact_name,mode,last_message_at,created_at,updated_at)
VALUES('validacao-local-conversation','validacao-local-lead','whatsapp','validacao-local:5581000000001','validacao-local','5581000000001','VALIDACAO local — contato sintético','HUMAN',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT OR IGNORE INTO messages(id,conversation_id,direction,type,body,status,created_at)
VALUES('validacao-local-message','validacao-local-conversation','IN','text','Conversa sintética para revisar a Inbox. Esta linha não possui provider e não envia mensagens.','RECEIVED',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
