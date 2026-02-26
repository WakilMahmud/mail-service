# Internal Email Platform (IEP)

## Centralized Multi-Tenant Email Infrastructure — Production-Grade Specification

------------------------------------------------------------------------

## 1. Overview

Our company operates multiple SaaS products. Each product currently
integrates its own email system (mostly Gmail SMTP with app passwords),
leading to duplication, inconsistency, and delivery risks.

We propose building a centralized **Internal Email Platform (IEP)** to
standardize email sending across all products.

A single product may need to send **multiple types of emails** (password reset,
invoice, notification, marketing digest, etc.) — each with its own template,
recipients, and behavior. The platform must support this flexibility natively.

------------------------------------------------------------------------

## 2. Objectives

- Eliminate repeated email module development across products
- Centralize template management with flexible, versioned templates
- Introduce provider abstraction (swap providers without product code changes)
- Add retry + queue-based delivery with dead-letter handling
- Improve deliverability and sender reputation
- Provide observability, monitoring & alerting
- Enable future provider migration (SES, SendGrid, Mailgun, etc.)
- Support attachments, CC/BCC, and rich transactional emails
- Provide webhook notifications for async status updates

------------------------------------------------------------------------

## 3. High-Level Architecture

```
Products (Tenants) → Load Balancer → Mail API → RabbitMQ → Workers → Email Providers
                                        ↓                      ↓
                                   PostgreSQL              S3/MinIO (attachments)
                                        ↑
                                     Redis (rate limiting, caching)
```

### Components

- **Mail API Service** — REST API, validation, auth, DB writes, queue publishing
- **Mail Worker Service** — Queue consumer, template rendering, provider dispatch, retry/DLQ
- **Webhook Worker Service** — Delivers webhook notifications to tenant callback URLs
- **PostgreSQL** — Persistent storage for messages, templates, tenants, events
- **RabbitMQ** — Message queue with DLX + TTL retry pattern
- **Redis** — Rate limiting, template caching, distributed locks
- **S3/MinIO** — Attachment storage
- **Provider Adapters** — SMTP (Gmail), SES, SendGrid, Mailgun (pluggable)
- **Admin Dashboard** — Operational visibility and management

------------------------------------------------------------------------

## 4. System Flow

1. Product calls `POST /v1/messages` with recipients (to, cc, bcc), template, variables, attachments
2. API validates payload, authenticates tenant via API key
3. Idempotency check: if `(tenant_id, idempotency_key)` exists → return existing `messageId`
4. Check recipient emails against tenant's suppression list
5. Attachments uploaded to S3/MinIO, metadata stored in DB
6. Message persisted in DB with status `queued`
7. Job published to RabbitMQ (`mail.send` queue)
8. Worker consumes job, loads message from DB
9. Caller-provided HTML/text rendered with Handlebars variables (if any)
10. Provider selected based on tenant config (with circuit breaker)
11. Email sent via provider adapter (to, cc, bcc, attachments)
12. Status updated in DB, lifecycle event recorded
13. Webhook notification published to `mail.webhook` queue
14. Webhook worker delivers status callback to tenant's registered URL

------------------------------------------------------------------------

## 5. Multi-Tenant Model

Each product is treated as a **tenant**. A single tenant may send many
different types of emails (e.g., Product A sends password resets, invoices,
and weekly digests — each with its own template and behavior).

### Per Tenant Configuration

- **API keys** — Multiple keys per tenant, each with scopes and expiration
- **Allowed sender domains** — Whitelist of domains the tenant can send from
- **Rate limits** — `max_per_minute`, `max_per_hour`, `max_per_day` (configurable)
- **Template namespace** — Templates scoped to tenant, organized by category/type
- **Provider routing policy** — Primary provider + fallback provider per tenant
- **Webhook endpoints** — Registered URLs for async status notifications
- **Attachment limits** — Max file size, max total size per message, allowed MIME types
- **Suppression list** — Auto-maintained list of bounced/complained addresses

------------------------------------------------------------------------

## 6. API Specification

### Authentication

- API key per tenant, sent via header: `x-api-key: <key>`
- API keys are hashed (bcrypt/argon2) and stored in DB
- Each key has scopes (`send`, `read`, `admin`) and optional expiration
- Validate key → map to `tenant_id` → enforce tenant isolation

### 6.1 Send Message

`POST /v1/messages`

The caller provides the email content directly — HTML body, optional text body, and subject. All three fields support **Handlebars** syntax (`{{variableName}}`) for dynamic content. If `variables` are provided, they are rendered into the content before sending.

```json
{
  "to": ["user@example.com", "user2@example.com"],
  "cc": ["manager@example.com"],
  "bcc": ["audit@example.com"],
  "from": {
    "email": "noreply@product.com",
    "name": "Product X"
  },
  "replyTo": "support@product.com",
  "subject": "{{productName}} — Reset your password",
  "htmlBody": "<html><body><p>Hello {{name}},</p><p>Click <a href='{{resetUrl}}'>here</a> to reset your password.</p><p>Regards,<br/>{{productName}} Team</p></body></html>",
  "textBody": "Hello {{name}}, reset your password at {{resetUrl}}",
  "variables": {
    "name": "Saif",
    "resetUrl": "https://app.example.com/reset?token=abc",
    "productName": "Product X"
  },
  "attachments": [
    {
      "filename": "invoice.pdf",
      "content": "<base64-encoded-content>",
      "contentType": "application/pdf"
    }
  ],
  "metadata": {
    "category": "transactional",
    "tags": ["password", "security"]
  },
  "priority": "high",
  "idempotencyKey": "reset-req-123"
}
```

**Content rules:**

- `htmlBody` is **required** — the full HTML email content provided by the caller
- `textBody` is optional — plain text fallback; if omitted, auto-generated from HTML
- `subject` is required — supports Handlebars variables
- `variables` is optional — key-value pairs rendered into subject, htmlBody, and textBody via Handlebars
- The platform does **not** store or manage templates — callers own their email content entirely

**Validation rules:**

- Validate all email formats (to, cc, bcc, from, replyTo)
- At least one recipient in `to` is required; `cc` and `bcc` are optional
- Enforce allowed sender domains per tenant (from.email domain check)
- Check all recipients against tenant suppression list; warn but don't block
- If `(tenant_id, idempotencyKey)` already exists → return existing `messageId`
- Validate attachment sizes against tenant limits
- Upload attachments to S3/MinIO, store metadata in DB
- Persist message (including raw htmlBody, textBody, subject, variables) as `queued`
- Publish `{ messageId, tenantId }` to RabbitMQ
- Return `{ messageId, status: "queued" }`

**Response:**
```json
{
  "messageId": "uuid-v4",
  "status": "queued",
  "suppressedRecipients": ["bounced-user@example.com"]
}
```

### 6.2 Get Message Status

`GET /v1/messages/:id`

Returns full message details including status, timestamps, events, and delivery info.

```json
{
  "messageId": "uuid",
  "status": "sent",
  "to": ["user@example.com"],
  "cc": ["manager@example.com"],
  "bcc": ["audit@example.com"],
  "subject": "Product X — Reset your password",
  "provider": "gmail-smtp",
  "attempts": 1,
  "lastError": null,
  "createdAt": "2026-02-25T12:00:00Z",
  "sentAt": "2026-02-25T12:00:02Z",
  "events": [
    { "type": "queued", "timestamp": "2026-02-25T12:00:00Z" },
    { "type": "sent", "timestamp": "2026-02-25T12:00:02Z" }
  ]
}
```

### 6.3 List Messages (Debug/Admin)

`GET /v1/messages?status=failed&limit=50&offset=0&from=2026-02-01&to=2026-02-25`

Supports filtering by: `status`, `to`, `dateRange`, `category`, `tags`.

### 6.4 Retry Failed Message

`POST /v1/messages/:id/retry`

Resets attempt count, re-publishes to `mail.send` queue. The original `htmlBody`, `textBody`, `subject`, and `variables` are preserved in the DB and re-used on retry.

### 6.5 Webhook Endpoints

```
POST   /v1/webhooks               — Register webhook URL
GET    /v1/webhooks               — List webhooks
PUT    /v1/webhooks/:id           — Update webhook
DELETE /v1/webhooks/:id           — Remove webhook
```

**Webhook payload:**
```json
{
  "url": "https://product-a.example.com/email-callback",
  "events": ["sent", "failed", "bounced"],
  "secret": "auto-generated-hmac-secret"
}
```

### 6.6 Health & Metrics

```
GET /health                      — Liveness check
GET /ready                       — Readiness check (DB, RabbitMQ, Redis connectivity)
GET /metrics                     — Prometheus metrics
```

------------------------------------------------------------------------

## 7. Database Structure

### tenants

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR(255) | Display name |
| slug | VARCHAR(100) UNIQUE | URL-safe identifier |
| settings | JSONB | Rate limits, attachment limits, provider config |
| active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### api_keys

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| key_hash | VARCHAR(255) | bcrypt/argon2 hash |
| key_prefix | VARCHAR(8) | First 8 chars for identification |
| scopes | TEXT[] | ['send', 'read', 'admin'] |
| active | BOOLEAN | DEFAULT true |
| expires_at | TIMESTAMPTZ | Nullable |
| last_used_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

### messages

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| to | TEXT[] | Recipient email addresses |
| cc | TEXT[] | CC recipients (nullable) |
| bcc | TEXT[] | BCC recipients (nullable) |
| from_email | VARCHAR(255) | Sender email |
| from_name | VARCHAR(255) | Sender display name |
| reply_to | VARCHAR(255) | Reply-to address (nullable) |
| subject | TEXT | Subject (Handlebars template, raw) |
| html_body | TEXT | HTML email content (Handlebars template, raw) |
| text_body | TEXT | Plain text fallback (nullable) |
| rendered_subject | TEXT | Subject after Handlebars rendering |
| rendered_html | TEXT | HTML after Handlebars rendering |
| rendered_text | TEXT | Text after Handlebars rendering (nullable) |
| variables | JSONB | Handlebars variables (nullable) |
| metadata | JSONB | Category, tags, custom data |
| status | VARCHAR(20) | queued / processing / sent / failed / bounced |
| provider | VARCHAR(50) | Provider used for delivery |
| priority | VARCHAR(10) | high / normal / low (DEFAULT 'normal') |
| attempts | INTEGER | DEFAULT 0 |
| max_attempts | INTEGER | DEFAULT 5 |
| last_error | TEXT | Last error message |
| idempotency_key | VARCHAR(255) | |
| scheduled_at | TIMESTAMPTZ | For future scheduled sending |
| sent_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Unique constraint:** `(tenant_id, idempotency_key)` — ensures idempotent delivery.

**Indexes:** `tenant_id`, `status`, `created_at`, `idempotency_key`, `(tenant_id, status)`, `(tenant_id, created_at)`.

### attachments

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| message_id | UUID FK → messages | |
| filename | VARCHAR(255) | Original filename |
| content_type | VARCHAR(100) | MIME type |
| size_bytes | INTEGER | File size in bytes |
| storage_key | TEXT | S3/MinIO object key |
| created_at | TIMESTAMPTZ | |

### events

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| message_id | UUID FK → messages | |
| type | VARCHAR(30) | queued / processing / sent / retry_scheduled / failed / bounced / dlq |
| payload | JSONB | Error details, provider response, metadata |
| created_at | TIMESTAMPTZ | |

**Index:** `(message_id, created_at)` — fast lifecycle queries.

### suppression_list

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| email | VARCHAR(255) | Suppressed email address |
| reason | VARCHAR(50) | 'hard_bounce', 'complaint', 'manual' |
| created_at | TIMESTAMPTZ | |

**Unique constraint:** `(tenant_id, email)`.

### webhook_endpoints

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| url | TEXT | Callback URL |
| events | TEXT[] | ['sent', 'failed', 'bounced'] |
| secret | VARCHAR(255) | HMAC signing secret |
| active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | |

### allowed_sender_domains

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| domain | VARCHAR(255) | e.g., 'product.com' |
| verified | BOOLEAN | SPF/DKIM verified |
| created_at | TIMESTAMPTZ | |

**Unique constraint:** `(tenant_id, domain)`.

------------------------------------------------------------------------

## 8. Caller-Provided Content & Rendering

The platform does **not** store or manage templates. Instead, **callers provide the full email content** (HTML, text, subject) directly in each API request. This design choice:

- **Eliminates template management overhead** — no CRUD, no versioning, no caching
- **Gives callers full flexibility** — each product controls its own email content, layouts, and branding
- **Supports any email type** from a single service — password resets, invoices, weekly digests, admin alerts — all via the same `POST /v1/messages` endpoint with different HTML content
- **Simplifies the platform** — IEP focuses purely on reliable delivery, not content management

### How It Works

1. Caller sends `htmlBody`, optional `textBody`, `subject`, and optional `variables` in the request
2. All three content fields support **Handlebars** syntax: `{{variableName}}`
3. Raw content is persisted in the `messages` table as-is (for retry and audit)
4. At send time, the worker renders Handlebars variables into the content
5. Rendered content is stored separately (`rendered_html`, `rendered_subject`, `rendered_text`)
6. If no `variables` are provided, content is sent as-is (no rendering step)

### Rendering Rules

- **Handlebars** is used for variable interpolation (lightweight, HTML-safe)
- If `variables` contains keys not present in the content → ignored (no error)
- If content contains `{{placeholder}}` but no matching variable → rendered as empty string (Handlebars default)
- If `htmlBody` is malformed HTML → still accepted (IEP is a delivery platform, not an HTML validator)
- If `textBody` is omitted → auto-stripped from `htmlBody` for plain text fallback

### Example: Different Email Types from One Service

A single product can send completely different emails using the same API:

**Password Reset:**
```json
{ "subject": "Reset your password", "htmlBody": "<p>Hello {{name}}, <a href='{{url}}'>reset</a></p>", "variables": { "name": "Saif", "url": "..." } }
```

**Invoice:**
```json
{ "subject": "Invoice #{{invoiceNumber}}", "htmlBody": "<h1>Invoice</h1><p>Amount: {{amount}}</p>...", "variables": { "invoiceNumber": "1234", "amount": "$99" } }
```

**System Alert (no variables):**
```json
{ "subject": "Server maintenance tonight", "htmlBody": "<p>We will be performing maintenance from 2-4 AM.</p>" }
```

------------------------------------------------------------------------

## 9. Attachment Handling

### Constraints (Configurable Per Tenant)

| Limit | Default | Notes |
|---|---|---|
| Max file size | 10 MB | Per individual file |
| Max total size per message | 25 MB | Sum of all attachments |
| Max attachment count | 10 | Per message |
| Allowed MIME types | Configurable | Default: PDF, images, Office docs, CSV |

### Flow

1. API receives attachments as base64-encoded content in the request body
2. Validate: file size, total size, count, MIME type against tenant config
3. Upload each file to S3/MinIO with a unique key: `{tenant_id}/{message_id}/{uuid}_{filename}`
4. Store metadata in `attachments` table
5. Worker downloads attachments from S3 at send time
6. Attach to email via provider adapter (nodemailer supports this natively)
7. Attachments are retained in S3 for a configurable retention period (default: 30 days)

### Alternative: URL-Based Attachments (Future)

Support `attachmentUrls[]` where tenants provide pre-hosted file URLs instead of inline content. Worker downloads at send time.

------------------------------------------------------------------------

## 10. Queue Strategy

### RabbitMQ Topology

| Component | Name | Purpose |
|---|---|---|
| Exchange | `mail.exchange` | Direct exchange for mail queues |
| Queue | `mail.send` | Primary send queue |
| Queue | `mail.retry` | TTL-based retry queue (DLX → `mail.send`) |
| Queue | `mail.dlq` | Dead-letter queue for permanently failed messages |
| Queue | `mail.webhook` | Webhook delivery queue |

### Retry Flow (DLX + TTL Pattern)

1. `mail-api` publishes `{ messageId, tenantId }` to `mail.send`
2. `mail-worker` consumes, processes, attempts delivery
3. **On transient failure:**
   - Increment `attempts` in DB
   - Record `retry_scheduled` event
   - Publish to `mail.retry` with TTL based on attempt number
   - TTL schedule (configurable): 60s → 300s → 900s → 3600s
4. **On max attempts reached:**
   - Publish to `mail.dlq`
   - Mark message `failed` in DB
   - Record `dlq` event
5. **On permanent failure:**
   - Mark message `failed` immediately (no retry)
   - Record `failed` event with error details

### Message Priority (Future)

Use separate queues or RabbitMQ priority queues:
- `mail.send.high` — processed first
- `mail.send.normal` — default
- `mail.send.low` — processed last

------------------------------------------------------------------------

## 11. Reliability Mechanisms

### Idempotency

- Unique constraint on `(tenant_id, idempotency_key)` in DB
- If duplicate detected → return existing `messageId` and current status
- Prevents duplicate sends even under network retries or client retries

### Rate Limiting

- Per-tenant sliding window counters in Redis
- Configurable: `max_per_minute`, `max_per_hour`, `max_per_day`
- When rate limited → return `429 Too Many Requests` with `Retry-After` header
- Per-provider rate limiting to respect provider sending limits

### Retry Rules

**Retry on transient errors:**
- Network timeouts
- 429 / throttling responses
- Temporary SMTP errors (4xx class)
- Provider temporarily unavailable

**Do NOT retry on permanent errors:**
- Invalid email addresses (hard bounce)
- Authentication / credential errors
- Handlebars render failure (malformed syntax)
- Sender domain not allowed
- Attachment validation failure

### Circuit Breaker (Per Provider)

- If a provider exceeds error threshold (e.g., 50% failure in 60s) → open circuit
- Fast-fail new requests, route to fallback provider if configured
- After cooldown period → half-open → test with single request
- Use `opossum` or equivalent circuit breaker library

### Graceful Shutdown

Workers implement SIGTERM handlers:
1. Stop accepting new messages from RabbitMQ (cancel consumer)
2. Wait for in-flight messages to complete (configurable timeout: 30s)
3. Close DB and Redis connections
4. Exit process

### Publisher Confirms

- Enable RabbitMQ publisher confirms on `mail-api`
- Do not return success to client until RabbitMQ acknowledges the message
- If confirm fails → return 503 to client

------------------------------------------------------------------------

## 12. Bounce & Suppression Handling

### Bounce Types

- **Hard bounce** — Permanent failure (invalid address, domain not found)
- **Soft bounce** — Temporary failure (mailbox full, server down)

### Suppression List

- Auto-add email to `suppression_list` after 3+ hard bounces
- Check suppression list before sending; suppressed recipients are skipped
- Return `suppressedRecipients[]` in API response so tenants are aware
- Tenants can manually add/remove addresses via API (future)

### Complaint Handling (Future — When Using SES/SendGrid)

- Process complaint feedback loops
- Auto-suppress complained addresses
- Alert tenant when complaint rate exceeds threshold

------------------------------------------------------------------------

## 13. Provider Abstraction

### Interface

```ts
interface EmailProvider {
  name: string;
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
  checkHealth(): Promise<boolean>;
}

interface ProviderSendInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  from: { email: string; name: string };
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: ProviderAttachment[];
  messageId: string;          // for correlation
}

interface ProviderAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

interface ProviderSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
  errorType?: 'transient' | 'permanent';
}
```

### Implementations

- **SmtpGmailProvider** — via nodemailer (MVP)
- **SesProvider** — Amazon SES (scaffolded/stubbed)
- **SendGridProvider** — SendGrid API (scaffolded/stubbed)

### Provider Selection

- Config-driven per tenant: `primary_provider` + `fallback_provider`
- Default provider for tenants without specific config
- Circuit breaker gates provider selection (skip unhealthy providers)

------------------------------------------------------------------------

## 14. Webhook Notifications

### Purpose

Products need async notifications when email status changes, without polling.

### Events

- `message.sent` — Email delivered successfully
- `message.failed` — Email permanently failed
- `message.bounced` — Email bounced
- `message.retrying` — Email scheduled for retry

### Delivery

- Webhook events published to `mail.webhook` queue (decoupled from email sending)
- Webhook worker consumes and delivers via HTTP POST to tenant's registered URL
- Payload signed with HMAC-SHA256 using tenant's webhook secret
- Retry webhook delivery 3 times with backoff on failure

### Webhook Payload

```json
{
  "event": "message.sent",
  "messageId": "uuid",
  "tenantId": "uuid",
  "timestamp": "2026-02-25T12:00:02Z",
  "data": {
    "to": ["user@example.com"],
    "subject": "Reset your password",
    "provider": "gmail-smtp",
    "attempts": 1
  }
}
```

**Signature header:** `x-iep-signature: sha256=<hmac-hex>`

------------------------------------------------------------------------

## 15. Security

- **API key authentication** — Keys hashed at rest, never stored in plain text
- **Encrypted provider credentials** — SMTP passwords, SES keys encrypted at rest
- **Sender domain restriction** — Only whitelisted domains per tenant
- **Tenant isolation** — All queries scoped by `tenant_id`; no cross-tenant access
- **TLS enforcement** — All SMTP connections use STARTTLS/TLS
- **Audit logs** — Full event trail for every message
- **Request payload size limits** — Configurable max body size (default: 30 MB)
- **Input sanitization** — Sanitize caller-provided HTML to prevent stored XSS in admin views
- **Webhook secret signing** — HMAC-SHA256 for webhook payload integrity

------------------------------------------------------------------------

## 16. Observability & Monitoring

### Structured Logging

- **pino** for structured JSON logs
- `correlationId` (= `messageId`) in every log line
- Log levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`

### Events Table

Records full message lifecycle:
- `queued` → `processing` → `sent` | `retry_scheduled` → `failed` | `bounced` | `dlq`

### Prometheus Metrics

- `iep_messages_total` — Counter by status, tenant, provider
- `iep_message_duration_seconds` — Histogram of send latency
- `iep_queue_depth` — Gauge of queue sizes
- `iep_provider_errors_total` — Counter by provider, error type
- `iep_rate_limit_hits_total` — Counter by tenant

### Alerting Rules (Grafana)

- DLQ depth > 0 for more than 5 minutes
- Provider error rate > 10% in 5 minutes
- Queue backlog > 1000 messages
- Worker not consuming for > 2 minutes

### Health Checks

- `GET /health` — Process alive (liveness probe)
- `GET /ready` — DB + RabbitMQ + Redis connected (readiness probe)

------------------------------------------------------------------------

## 17. Admin Dashboard Features

- View messages by status, tenant, date range
- Search email history (recipient, subject, messageId)
- Preview rendered email content (HTML viewer)
- Retry failed emails (single or bulk)
- View message lifecycle events and delivery details
- Manage tenants (create, configure, deactivate)
- API key generation and rotation
- View and manage suppression lists
- Delivery analytics (sent/failed/bounced rates over time)
- Queue health monitoring (depth, consumer count)
- Provider health status (circuit breaker state)

------------------------------------------------------------------------

## 18. Containerization & Deployment

### Docker Services

| Service | Dockerfile | Port |
|---|---|---|
| mail-api | `apps/mail-api/Dockerfile` | 3000 |
| mail-worker | `apps/mail-worker/Dockerfile` | — |
| mail-webhook-worker | `apps/mail-webhook-worker/Dockerfile` | — |
| PostgreSQL | Official image | 5432 |
| RabbitMQ | Official image (management) | 5672 / 15672 |
| Redis | Official image | 6379 |
| MinIO | Official image | 9000 |

### docker-compose.yml

Includes all services with proper dependency ordering, health checks, volumes, and networking.

### Also Includes

- `.env.example` — All environment variables documented
- `README.md` — Setup, run, test, and deployment instructions
- Diagram of queue topology

------------------------------------------------------------------------

## 19. MVP Scope (Phase 1)

**Target: 2–3 weeks**

- [ ] Mail API with `POST /v1/messages` (to, cc, bcc, htmlBody, textBody, variables, attachments)
- [ ] Handlebars rendering of caller-provided content
- [ ] API key authentication and tenant isolation
- [ ] RabbitMQ integration with DLX+TTL retry
- [ ] Worker service with provider dispatch
- [ ] SMTP/Gmail provider adapter
- [ ] Attachment handling (upload to S3/MinIO, send)
- [ ] Idempotency enforcement
- [ ] Error classification and retry logic
- [ ] Events table for full lifecycle tracking
- [ ] Health check endpoints
- [ ] Graceful shutdown
- [ ] Docker Compose setup
- [ ] Unit + integration tests
- [ ] README + API documentation

------------------------------------------------------------------------

## 20. Future Roadmap (Post-MVP)

### Phase 2 (Weeks 3–4)
- Webhook notifications
- Suppression list management
- Prometheus metrics + Grafana dashboards
- Circuit breaker per provider
- Admin dashboard (basic)
- Rate limiting (Redis-based)

### Phase 3 (Weeks 5–8)
- Amazon SES provider integration
- Domain verification (SPF/DKIM)
- Scheduled/delayed emails
- Message priority queues
- Bulk sending API
- Client SDK generation (TypeScript, Python)
- Auto provider failover

### Phase 4 (Future)
- Marketing email support
- Open/click tracking
- URL-based attachments
- Database partitioning (monthly)
- Read replicas for admin queries
- Horizontal auto-scaling
- Standalone SaaS offering

------------------------------------------------------------------------

## 21. Business Impact

### Engineering
- No duplicated email code across products
- Centralized debugging and observability
- Easier provider migration (change in one place)
- Standardized reliability (retry, DLQ, idempotency) for free

### Operational
- Better deliverability through centralized reputation management
- Controlled, per-tenant rate limiting
- Compliance improvement via audit trails and suppression lists

### Strategic
- Internal infrastructure maturity milestone
- Potential standalone SaaS product
- Foundation for richer communication features (SMS, push, in-app)

------------------------------------------------------------------------

## 22. Success Criteria

A new product integrates email by:

1. Requesting a tenant account and API key
2. Registering allowed sender domains
3. Calling `POST /v1/messages` with to, cc, bcc, htmlBody, subject, variables, and optional attachments
4. Optionally registering webhook endpoints for async status updates

**No per-project SMTP integration code, template setup, or email configuration should be needed anymore.**

------------------------------------------------------------------------

End of Document
