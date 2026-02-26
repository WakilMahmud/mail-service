# Internal Email Platform (IEP) — Build Prompt (Best Stack Choice)

## Why **NOT** Laravel / Java / Python (for this specific project)

This project is **queue-driven, IO-heavy, concurrency-focused** (RabbitMQ consumers, SMTP/HTTP provider calls, retries, throttling, webhooks, async pipelines). The key success factors are:
- High-throughput async processing
- Simple horizontal scaling of workers
- Strong RabbitMQ ecosystem
- Great developer velocity + maintainability
- Clear modular architecture for multi-tenancy + providers

### Laravel (PHP)
- ✅ Fast to ship APIs, great DX
- ❌ Worker concurrency and long-running process ergonomics are weaker than Node/Java (you can do it, but it’s not the “native sweet spot”)
- ❌ Stronger risk of divergent patterns (artisan queue vs RabbitMQ patterns, DLX/TTL fine-tuning, custom backoff logic)

### Python
- ✅ Fast prototyping, good libs
- ❌ Async + high concurrency is possible (asyncio/Celery), but production patterns become more complex and footguns appear with event loops, blocking libs, and runtime performance under load
- ❌ If you want “fast + efficient + simple scaling” without extra ceremony, Node/Java usually win here

### Java
- ✅ Best-in-class throughput, strong typing, mature ecosystem (Spring Boot)
- ✅ Excellent for high scale and reliability
- ❌ Higher implementation overhead and slower iteration speed for MVP compared to Node
- ❌ Heavier operational footprint for a first version unless you already have strong Java platform standards

## Best Option for “Most Efficient + Faster to Build”
### ✅ **Node.js with TypeScript (NestJS)**

**Why this is the best fit for your current requirements**
- **Async by default**: excellent for RabbitMQ + SMTP/HTTP provider IO
- **Fastest delivery** of a production-grade MVP with clean modular architecture
- **Great ecosystem**: amqplib, bullmq-like patterns, templating (handlebars), validation, structured logging
- **Horizontal scaling**: add worker replicas, no code changes
- **Team alignment**: your org already uses React/Next + Node tooling in places → shared mental model

> If you later need extreme throughput or a broader “platform engineering” standard, you can still move workers to Java.  
> But the API contract + queue contracts remain unchanged because of the **provider abstraction + message schema**.

---

# ✅ MASTER AGENT BUILD PROMPT (NestJS + TypeScript)

**Use this prompt with the attached file:** `Internal_Email_Platform_IEP.md`

---

## ROLE

You are a Principal Software Architect and Senior Backend Engineer.  
You will implement a production-ready, multi-tenant **Internal Email Platform (IEP)** based on the provided specification document.

You must:
- Read and follow `Internal_Email_Platform_IEP.md`
- Improve the design where necessary (without changing core requirements)
- Deliver production-grade code and documentation
- Prioritize reliability, idempotency, retries, and observability

---

## INPUTS

- `Internal_Email_Platform_IEP.md` (functional spec)
- Runtime constraints: **we have our own server** and **RabbitMQ is available**
- Goal: replace scattered Gmail SMTP integrations with a centralized internal platform

---

## STACK (MANDATORY)

### Core
- **Node.js 20+**
- **TypeScript**
- **NestJS**

### Messaging
- **RabbitMQ** (DLX + TTL retry pattern)

### Database
- **PostgreSQL**
- ORM: **Prisma** (preferred) or TypeORM (acceptable)

### Templating
- **Handlebars** (or Liquid-compatible equivalent)

### Observability
- **pino** (structured logging)
- correlationId per message
- persist message lifecycle events to DB

### Containerization
- Docker + docker-compose (API, Worker, PostgreSQL, RabbitMQ)

---

## DELIVERABLES (MANDATORY OUTPUTS)

1. Refined architecture (text diagram)
2. Folder structure (monorepo or multi-service) with clear modules
3. Database schema (Prisma + SQL migration)
4. REST API spec (endpoints + payloads)
5. RabbitMQ topology (exchanges/queues/DLX/TTL/retry flow)
6. Worker implementation (consumer, retries, backoff, DLQ)
7. Provider abstraction + SMTP adapter
8. Idempotency implementation (tenant_id + idempotency_key)
9. Admin-lite endpoints for debugging (list failed, retry by id)
10. docker-compose + local runbook
11. Unit + integration tests
12. Production readiness checklist

---

## REQUIRED SERVICE SPLIT

Build **two services** (separate processes):

### 1) `mail-api`
- REST API
- Auth (API keys)
- Validations
- DB writes
- Publishes jobs to RabbitMQ

### 2) `mail-worker`
- Consumes RabbitMQ
- Loads message by messageId from DB
- Renders template
- Sends via provider adapter
- Retry + DLQ handling
- Updates status + events

> Services may live in one monorepo, but must run as separate processes/containers.

---

## MODULE STRUCTURE (REQUIRED)

Use NestJS modules (clean separation):

```
/apps
  /mail-api
  /mail-worker
/packages
  /common        (dto, validation, errors, logger, correlation id, config)
  /db            (prisma schema, migrations, db client)
  /providers     (provider interfaces + smtp implementation)
  /rendering     (handlebars renderer for caller-provided content)
  /queue         (rabbit client wrapper, publishers, consumers)
  /tenancy       (tenant auth, api keys, policies)
  /messages      (message domain, status machine)
```

---

## API REQUIREMENTS

### Authentication
- API key per tenant
- Header: `x-api-key: <key>`
- Validate and map to `tenant_id`

### Endpoint: Create Message
`POST /v1/messages`

Payload:
```json
{
  "to": ["user@example.com"],
  "cc": [],
  "bcc": [],
  "from": { "email": "noreply@product.com", "name": "Product X" },
  "subject": "{{productName}} — Reset your password",
  "htmlBody": "<html><body><p>Hello {{name}}, click <a href='{{resetUrl}}'>here</a></p></body></html>",
  "textBody": "Hello {{name}}, reset your password at {{resetUrl}}",
  "variables": { "name": "Saif", "resetUrl": "https://...", "productName": "Product X" },
  "attachments": [
    { "filename": "invoice.pdf", "content": "<base64>", "contentType": "application/pdf" }
  ],
  "idempotencyKey": "reset-req-123"
}
```

Rules:
- Validate email formats
- `htmlBody` is required; `textBody` is optional (auto-generated from HTML if omitted)
- `subject` is required; supports Handlebars variables
- `variables` is optional; rendered into subject, htmlBody, textBody via Handlebars
- Enforce allowed sender domains per tenant
- If `(tenant_id, idempotencyKey)` already exists → return existing `messageId`
- Persist message (raw content + variables) as `queued`
- Publish `{ messageId, tenantId }` to RabbitMQ
- Return `{ messageId, status: "queued" }`

### Endpoint: Status
`GET /v1/messages/:id`

Returns status + last_error + timestamps.

### Debug endpoints (minimum)
- `GET /v1/messages?status=failed&limit=50`
- `POST /v1/messages/:id/retry`

---

## DATABASE REQUIREMENTS (MINIMUM)

Tables:
- tenants
- api_keys
- messages
- attachments
- events
- suppression_list

Must include:
- UUID primary keys
- indexes on: tenant_id, status, created_at, idempotency_key
- events table stores lifecycle transitions
- messages table stores raw content (htmlBody, textBody, subject, variables) + rendered content

---

## RABBITMQ TOPOLOGY (MANDATORY)

Use DLX + TTL retry:

- Exchange: `mail.exchange`
- Queue: `mail.send`
- Queue: `mail.retry` (with TTL) → DLX routes back to `mail.send`
- Queue: `mail.dlq` (dead-letter)

Workflow:
1. `mail-api` publishes to `mail.send`
2. `mail-worker` consumes
3. On transient failure:
   - increment attempts
   - publish to `mail.retry` with increasing delay
4. On max attempts:
   - publish to `mail.dlq`
   - mark message failed

---

## RETRY & ERROR CLASSIFICATION (MANDATORY)

### Retry only on transient errors:
- network timeouts
- 429 / throttling
- temporary SMTP errors (4xx class)
- provider unavailable

### No retry on permanent errors:
- invalid email addresses
- auth/credential errors
- Handlebars render failure (malformed syntax)
- sender not allowed

Retry schedule (configurable):
- 1m, 5m, 15m, 60m (or exponential backoff)

Max attempts (configurable):
- default 5

---

## PROVIDER ABSTRACTION (MANDATORY)

Define:

```ts
interface EmailProvider {
  name: string;
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
}
```

Implement:
- `SmtpGmailProvider` (via nodemailer)
- Include scaffolding for SES provider (can be stubbed)

Provider selection:
- config-driven per tenant
- default provider fallback

---

## CONTENT RENDERING (MANDATORY)

- Callers provide `htmlBody`, optional `textBody`, and `subject` directly in the API request
- All three fields support Handlebars syntax for variable interpolation
- The platform does NOT store or manage templates — callers own their content
- Render using Handlebars at send time in the worker
- If `variables` provided → render into content; if not → send as-is
- If `textBody` omitted → auto-generate plain text from `htmlBody`
- Store both raw content and rendered content in the messages table (for retry + audit)

---

## OBSERVABILITY (MANDATORY)

- correlationId (use messageId) in every log line
- structured logs (pino)
- events table records:
  - queued
  - sent
  - retry_scheduled
  - failed
  - dlq

---

## TESTING (MANDATORY)

- Unit tests:
  - idempotency logic
  - template rendering + missing variables
  - error classification + retry decision
- Integration tests:
  - API → DB insert → queue publish
  - Worker consumes → provider mocked → status updated

Use a mocked SMTP transport in tests.

---

## CONTAINERIZATION (MANDATORY)

Provide:
- Dockerfile for API
- Dockerfile for Worker
- docker-compose.yml including:
  - rabbitmq
  - postgres
  - mail-api
  - mail-worker

Also include:
- `.env.example`
- local setup instructions in README

---

## FINAL OUTPUT EXPECTATIONS

At the end, produce:
- Full repo code
- README with setup + run + test commands
- Diagram and explanation of queue topology
- Clear instructions for adding a new provider
- Clear instructions for onboarding a new product (tenant + api key + templates)

---

## IMPORTANT CONSTRAINTS

- Never send emails synchronously from the API request path
- Never expose SMTP credentials to client products
- Enforce tenant isolation strictly
- Always persist message + events for auditability
- Design so workers can scale horizontally without duplicated sends

---

## SUCCESS CRITERIA

A new product can integrate email by:
1) requesting an API key
2) calling `POST /v1/messages` with htmlBody, subject, variables, and optional attachments

No per-project SMTP integration code or template setup should be needed anymore.

