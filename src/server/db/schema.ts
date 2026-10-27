import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const editions = sqliteTable("editions", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  destination: text("destination").notNull(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  status: text("status").notNull().default("DRAFT"),
  capacity: integer("capacity").notNull(),
  ...timestamps,
});

export const priceBatches = sqliteTable("price_batches", {
  id: text("id").primaryKey(),
  editionId: text("edition_id").notNull().references(() => editions.id),
  name: text("name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  installmentCount: integer("installment_count").notNull().default(1),
  validFrom: text("valid_from"),
  validUntil: text("valid_until"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const availability = sqliteTable("availability", {
  editionId: text("edition_id").primaryKey().references(() => editions.id),
  reserved: integer("reserved").notNull().default(0),
  sold: integer("sold").notNull().default(0),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  normalizedEmail: text("normalized_email").notNull(),
  phone: text("phone").notNull(),
  normalizedPhone: text("normalized_phone").notNull(),
  instagram: text("instagram"),
  company: text("company"),
  cityState: text("city_state"),
  editionId: text("edition_id").references(() => editions.id),
  stage: text("stage").notNull().default("NOVO"),
  consentVersion: text("consent_version").notNull(),
  consentAt: text("consent_at").notNull(),
  sourceSystem: text("source_system").notNull().default("platform"),
  externalId: text("external_id"),
  dedupeKey: text("dedupe_key").notNull().unique(),
  requestId: text("request_id"),
  ...timestamps,
}, (table) => [
  index("leads_normalized_email_idx").on(table.normalizedEmail),
  index("leads_normalized_phone_idx").on(table.normalizedPhone),
  index("leads_stage_idx").on(table.stage),
  uniqueIndex("leads_source_external_uidx").on(table.sourceSystem, table.externalId),
]);

export const leadAnswers = sqliteTable("lead_answers", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id),
  answersJson: text("answers_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const leadAttribution = sqliteTable("lead_attribution", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id),
  touchType: text("touch_type").notNull(),
  landingUrl: text("landing_url").notNull(),
  referrer: text("referrer"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),
  utmTerm: text("utm_term"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("lead_touch_uidx").on(table.leadId, table.touchType)]);

export const pipelineHistory = sqliteTable("pipeline_history", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id),
  fromStage: text("from_stage"),
  toStage: text("to_stage").notNull(),
  actorId: text("actor_id"),
  reason: text("reason"),
  createdAt: text("created_at").notNull(),
});

export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  actorId: text("actor_id"),
  assignedTo: text("assigned_to").references(() => users.id),
  priority: text("priority").notNull().default("NORMAL"),
  dueAt: text("due_at"),
  completedAt: text("completed_at"),
  completedBy: text("completed_by").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (table) => [
  index("activities_due_idx").on(table.completedAt, table.dueAt),
  index("activities_assigned_idx").on(table.assignedTo, table.completedAt),
]);

export const assignments = sqliteTable("assignments", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id),
  userId: text("user_id").notNull(),
  assignedBy: text("assigned_by").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const whatsappInstances = sqliteTable("whatsapp_instances", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull().default("uazapi"),
  state: text("state").notNull().default("disconnected"),
  phone: text("phone"),
  profileName: text("profile_name"),
  lastError: text("last_error"),
  operationToken: text("operation_token"),
  operationStartedAt: text("operation_started_at"),
  ...timestamps,
});

export const whatsappAgents = sqliteTable("whatsapp_agents", {
  id: text("id").primaryKey(),
  instanceId: text("instance_id").unique().references(() => whatsappInstances.id),
  name: text("name").notNull(),
  instructions: text("instructions").notNull(),
  model: text("model").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  ...timestamps,
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").references(() => leads.id),
  channel: text("channel").notNull(),
  whatsappInstanceId: text("whatsapp_instance_id").references(() => whatsappInstances.id),
  contactPhone: text("contact_phone"),
  contactName: text("contact_name"),
  externalId: text("external_id").notNull(),
  mode: text("mode").notNull().default("AGENT"),
  humanActive: integer("human_active", { mode: "boolean" }).notNull().default(false),
  claimedBy: text("claimed_by").references(() => users.id),
  claimedAt: text("claimed_at"),
  releasedAt: text("released_at"),
  agentPausedAt: text("agent_paused_at"),
  agentError: text("agent_error"),
  agentProcessingToken: text("agent_processing_token"),
  agentProcessingStartedAt: text("agent_processing_started_at"),
  summary: text("summary"),
  summarizedMessageCount: integer("summarized_message_count").notNull().default(0),
  summaryUpdatedAt: text("summary_updated_at"),
  lastMessageAt: text("last_message_at"),
  optedOutAt: text("opted_out_at"),
  requestId: text("request_id"),
  ...timestamps,
}, (table) => [
  index("conversations_page_idx").on(sql`coalesce(${table.lastMessageAt},${table.updatedAt}) DESC`,sql`${table.id} DESC`),
  uniqueIndex("conversation_external_uidx").on(table.channel, table.externalId),
  index("conversations_mode_updated_idx").on(table.mode, table.updatedAt),
  index("conversations_claimed_by_idx").on(table.claimedBy),
  index("conversations_agent_lease_idx").on(table.agentProcessingStartedAt).where(sql`${table.agentProcessingToken} IS NOT NULL`),
]);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  checkoutId: text("checkout_id").references(() => checkouts.id),
  actorId: text("actor_id").references(() => users.id),
  externalId: text("external_id"),
  inReplyTo:text("in_reply_to"),
  direction: text("direction").notNull(),
  type: text("type").notNull(),
  body: text("body"),
  status: text("status").notNull(),
  templateName: text("template_name"),
  payloadJson: text("payload_json"),
  lastError: text("last_error"),
  sendStartedAt:text("send_started_at"),
  acceptedAt: text("accepted_at"),
  sentAt:text("sent_at"),deliveredAt:text("delivered_at"),readAt:text("read_at"),statusUpdatedAt:text("status_updated_at"),statusCheckedAt:text("status_checked_at"),statusCheckError:text("status_check_error"),
  failedAt: text("failed_at"),
  requestId: text("request_id"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("messages_external_uidx").on(table.externalId),
  uniqueIndex("messages_agent_reply_uidx").on(table.conversationId,table.inReplyTo).where(sql`${table.inReplyTo} IS NOT NULL`),
  index("messages_conversation_page_idx").on(table.conversationId,sql`${table.createdAt} DESC`,sql`${table.id} DESC`),
  index("messages_checkout_idx").on(table.checkoutId),
  index("messages_delivery_poll_idx").on(table.statusCheckedAt,table.createdAt).where(sql`${table.direction}='OUT' AND ${table.status} IN ('ACCEPTED','SENT','DELIVERED','SEND_UNKNOWN')`),
  index("messages_sending_lease_idx").on(sql`coalesce(${table.sendStartedAt},${table.createdAt})`).where(sql`${table.status}='SENDING'`),
]);

export const checkouts = sqliteTable("checkouts", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id),
  editionId: text("edition_id").notNull().references(() => editions.id),
  priceBatchId: text("price_batch_id").notNull().references(() => priceBatches.id),
  conversationId:text("conversation_id").references(()=>conversations.id),whatsappInstanceId:text("whatsapp_instance_id").references(()=>whatsappInstances.id),deliveryChannel:text("delivery_channel").notNull().default("meta"),
  provider: text("provider").notNull().default("asaas"),
  billingDocumentCiphertext:text("billing_document_ciphertext"),
  providerCustomerId: text("provider_customer_id"),
  providerPaymentId: text("provider_payment_id"),
  providerInstallmentId: text("provider_installment_id"),
  method: text("method").notNull(),
  installmentCount: integer("installment_count").notNull().default(1),
  amountCents: integer("amount_cents").notNull(),
  url: text("url"),
  status: text("status").notNull(),
  financialStatus: text("financial_status").notNull().default("NOT_STARTED"),
  sendStatus: text("send_status").notNull().default("NOT_REQUESTED"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  authorizedBy: text("authorized_by").notNull(),
  expiresAt: text("expires_at"),
  lastErrorCode: text("last_error_code"),
  lastError: text("last_error"),
  lastErrorAt: text("last_error_at"),
  readyAt: text("ready_at"),
  sendRequestedAt: text("send_requested_at"),
  sentAt: text("sent_at"),
  deliveredAt: text("delivered_at"),
  pendingAt: text("pending_at"),
  paidAt: text("paid_at"),
  cancelledAt: text("cancelled_at"),
  refundedAt: text("refunded_at"),
  reservationReleasedAt: text("reservation_released_at"),
  processingToken: text("processing_token"),
  processingStartedAt: text("processing_started_at"),
  retryCount: integer("retry_count").notNull().default(0),
  nextRetryAt: text("next_retry_at"),
  requestId: text("request_id"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("checkouts_conversation_idx").on(table.conversationId),
  index("checkouts_status_idx").on(table.status),
  index("checkouts_financial_status_idx").on(table.financialStatus),
  index("checkouts_send_status_idx").on(table.sendStatus),
  index("checkouts_provider_installment_idx").on(table.providerInstallmentId),
]);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  checkoutId: text("checkout_id").notNull().references(() => checkouts.id),
  providerPaymentId: text("provider_payment_id").notNull().unique(),
  providerInstallmentId: text("provider_installment_id"),
  installmentNumber: integer("installment_number"),
  status: text("status").notNull(),
  amountCents: integer("amount_cents").notNull(),
  dueDate: text("due_date"),
  paidAt: text("paid_at"),
  payloadJson: text("payload_json"),
  ...timestamps,
});

export const refunds = sqliteTable("refunds", {
  id: text("id").primaryKey(),
  paymentId: text("payment_id").notNull().references(() => payments.id),
  providerRefundId: text("provider_refund_id").notNull().unique(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull(),
  ...timestamps,
});

export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  eventType: text("event_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  processedAt: text("processed_at"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: text("last_attempt_at"),
  nextRetryAt: text("next_retry_at"),
  requestId: text("request_id"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("webhook_provider_external_uidx").on(table.provider, table.externalId),
  index("webhook_pending_retry_idx").on(table.provider, table.processedAt, table.nextRetryAt),
  index("webhook_operations_idx").on(table.provider,table.processedAt,table.attempts,table.createdAt),
]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("user_role_uidx").on(table.userId, table.role)]);

export const adminCredentials = sqliteTable("admin_credentials", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const adminSessions = sqliteTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("admin_sessions_user_idx").on(table.userId), index("admin_sessions_expiry_idx").on(table.expiresAt)]);

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  payloadJson: text("payload_json"),
  requestId: text("request_id"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("notifications_entity_idx").on(table.entityType, table.entityId),
  index("notifications_created_at_idx").on(table.createdAt),
]);

export const notificationRecipients = sqliteTable("notification_recipients", {
  id: text("id").primaryKey(),
  notificationId: text("notification_id").notNull().references(() => notifications.id),
  userId: text("user_id").notNull().references(() => users.id),
  channel: text("channel").notNull(),
  providerMessageId:text("provider_message_id"),
  deliveryStatus: text("delivery_status").notNull().default("PENDING"),
  readAt: text("read_at"),
  sentAt: text("sent_at"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("notification_recipient_channel_uidx").on(table.notificationId, table.userId, table.channel),
  index("notification_recipients_user_read_idx").on(table.userId, table.readAt, table.createdAt),
  index("notification_recipients_delivery_idx").on(table.deliveryStatus, table.updatedAt),
]);

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  ip: text("ip"),
  requestId: text("request_id"),
  createdAt: text("created_at").notNull(),
});

export const idempotencyKeys = sqliteTable("idempotency_keys", {
  key: text("key").primaryKey(),
  scope: text("scope").notNull(),
  resourceId: text("resource_id").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const outboxEvents = sqliteTable("outbox_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  dedupeKey: text("dedupe_key").unique(),
  payloadJson: text("payload_json").notNull(),
  attempts: integer("attempts").notNull().default(0),
  publishedAt: text("published_at"),
  dispatchState:text("dispatch_state").notNull().default("PENDING"),holdReason:text("hold_reason"),processingToken:text("processing_token"),processingStartedAt:text("processing_started_at"),processedAt:text("processed_at"),processingAttempts:integer("processing_attempts").notNull().default(0),deferredAttempts:integer("deferred_attempts").notNull().default(0),
  nextAttemptAt: text("next_attempt_at"),
  lastError: text("last_error"),
  requestId: text("request_id"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("outbox_pending_idx").on(table.publishedAt, table.nextAttemptAt, table.createdAt),index("outbox_operations_idx").on(table.dispatchState,table.type,table.createdAt),index("outbox_completed_idx").on(table.processedAt).where(sql`${table.processedAt} IS NOT NULL`),index("outbox_commercial_watermark_idx").on(table.processedAt).where(sql`${table.type} NOT LIKE 'uazapi.%' AND ${table.processedAt} IS NOT NULL`)]);

export const rateLimitBuckets = sqliteTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  scope: text("scope").notNull(),
  windowStartedAt: text("window_started_at").notNull(),
  count: integer("count").notNull().default(0),
  expiresAt: text("expires_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("rate_limit_expiry_idx").on(table.expiresAt)]);

export const operationLeases = sqliteTable("operation_leases", { id:text("id").primaryKey(),token:text("token").notNull(),expiresAt:text("expires_at").notNull() });
export const historyImports = sqliteTable("history_imports", { externalId:text("external_id").primaryKey(),lineId:text("line_id").notNull(),cursor:integer("cursor").default(0).notNull(),attempts:integer("attempts").default(0).notNull(),nextAttemptAt:text("next_attempt_at"),completedAt:text("completed_at"),updatedAt:text("updated_at").notNull() },table=>[index("history_imports_pending_idx").on(table.completedAt,table.nextAttemptAt,table.updatedAt)]);

export const operationalHealth=sqliteTable("operational_health",{
 service:text("service").primaryKey(),lastStartedAt:text("last_started_at"),lastCompletedAt:text("last_completed_at"),lastSuccessAt:text("last_success_at"),lastErrorCode:text("last_error_code"),pending:integer("pending").notNull().default(0),oldestPendingAt:text("oldest_pending_at"),watermark:text("watermark"),failures:integer("failures").notNull().default(0),stalledRuns:integer("stalled_runs").notNull().default(0),failureStreak:integer("failure_streak").notNull().default(0),peakPending:integer("peak_pending").notNull().default(0),
});
export const resourceUsage=sqliteTable("resource_usage",{
 resource:text("resource").primaryKey(),windowStart:text("window_start").notNull(),windowEnd:text("window_end").notNull(),used:integer("used").notNull(),budget:integer("budget"),observedAt:text("observed_at").notNull(),source:text("source").notNull(),oldestItemAt:text("oldest_item_at"),
});

export const uazapiHistorySyncs=sqliteTable("uazapi_history_syncs",{
 id:text("id").primaryKey(),lineId:text("line_id").notNull().references(()=>whatsappInstances.id),status:text("status").notNull().default("PENDING"),providerOffset:integer("provider_offset").notNull().default(0),scannedCount:integer("scanned_count").notNull().default(0),skippedCount:integer("skipped_count").notNull().default(0),attempts:integer("attempts").notNull().default(0),nextAttemptAt:text("next_attempt_at"),lastError:text("last_error"),requestedBy:text("requested_by").references(()=>users.id),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),completedAt:text("completed_at"),
},table=>[uniqueIndex("uazapi_history_active_idx").on(table.lineId).where(sql`${table.status} IN ('PENDING','RUNNING')`),index("uazapi_history_pending_idx").on(table.status,table.nextAttemptAt,table.updatedAt)]);

export const aiProviderCooldowns=sqliteTable('ai_provider_cooldowns',{
 scope:text('scope').primaryKey(),availableAt:text('available_at').notNull(),errorCode:text('error_code').notNull(),updatedAt:text('updated_at').notNull(),
});
export const conversationProductMemory=sqliteTable('conversation_product_memory',{
 conversationId:text('conversation_id').primaryKey().references(()=>conversations.id,{onDelete:'cascade'}),
 focusJson:text('focus_json').notNull(),lastMessageAt:text('last_message_at').notNull(),lastMessageId:text('last_message_id').notNull(),
 revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull(),
});
