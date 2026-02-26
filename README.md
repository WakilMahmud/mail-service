# 📧 IEP — Internal Email Platform

A **production-grade internal email sending platform** built as a NestJS monorepo. IEP provides a reliable, scalable, and multi-tenant API for sending transactional emails with built-in retry logic, suppression lists, and full audit trails.

---

## 🏗️ Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Caller /   │     │              │     │              │
│   Client     │────▶│  Mail API    │────▶│  RabbitMQ    │
│              │     │  (port 3000) │     │  (port 5672) │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│              │     │              │     │              │
│  PostgreSQL  │◀────│ Mail Worker  │────▶│ SMTP Server  │
│  (port 5433) │     │ (port 3001)  │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
```

**Two services, clear responsibilities:**

| Service | Port | Role |
|---------|------|------|
| **Mail API** | `3000` | HTTP REST API — accepts email requests, validates input, stores in DB, publishes to queue |
| **Mail Worker** | `3001` | Background consumer — picks messages from RabbitMQ, renders Handlebars templates, sends via SMTP, handles retries |

---

## ✨ Key Features

- **Multi-Tenant** — API key-based authentication with per-tenant rate limits
- **Idempotent Sends** — Duplicate requests return the existing message (no double-sends)
- **TO / CC / BCC** — Full recipient support with validation
- **Handlebars Rendering** — Caller provides HTML/text with `{{variable}}` placeholders
- **Retry with Backoff** — RabbitMQ DLX + TTL topology (10s → 1m → 5m)
- **Error Classification** — Permanent errors (bad recipient, render failure) fail immediately; transient errors (timeout, rate limit) retry
- **Suppression List** — Automatically skips bounced/suppressed recipients
- **Audit Trail** — Full event history per message (queued → processing → sent/failed)
- **Health Checks** — `/health/live` and `/health/ready` endpoints for orchestrators
- **Swagger / OpenAPI** — Interactive API docs at `/docs`
- **Structured Logging** — JSON logs via Pino with log level configuration
- **Graceful Shutdown** — Worker drains active jobs before stopping

---

## 📁 Project Structure

```
IEP_AGENT/
├── apps/
│   ├── mail-api/                     # HTTP API Service
│   │   └── src/
│   │       ├── main.ts               # Bootstrap (pino, helmet, Swagger, versioning)
│   │       ├── app.module.ts          # Root module
│   │       ├── auth/                  # API key guard + tenant decorator
│   │       ├── messages/              # Messages controller + service
│   │       ├── health/                # Liveness + readiness probes
│   │       └── common/               # Exception filter, correlation ID interceptor
│   └── mail-worker/                   # Background Worker Service
│       └── src/
│           ├── main.ts               # Bootstrap (health only)
│           ├── app.module.ts          # Root module
│           └── consumer/             # RabbitMQ consumer + processing pipeline
├── libs/
│   ├── common/                        # Shared DTOs, interfaces, errors, tokens
│   ├── database/                      # Prisma schema, service, repositories
│   ├── queue/                         # RabbitMQ service + topology management
│   ├── rendering/                     # Handlebars rendering with caching
│   └── providers/                     # Email provider abstraction (SMTP)
├── config/                            # Namespaced config (app, db, queue, redis, smtp)
├── scripts/
│   └── seed-tenant.ts                # Seeds a development tenant
├── docker-compose.yml                 # PostgreSQL, RabbitMQ, Redis, MinIO
├── .env                               # Environment variables (local)
├── .env.example                       # Environment variables template
└── nest-cli.json                      # NestJS monorepo configuration
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **Docker Desktop** (for PostgreSQL, RabbitMQ, Redis)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file (skip if `.env` already exists):

```bash
cp .env.example .env
```

> **⚠️ Important:** If you have a **local PostgreSQL** running on port `5432`, our Docker Postgres uses port **`5433`** to avoid conflict. This is already configured in the default `.env`.

### 3. Start Infrastructure (Docker)

```bash
docker-compose up -d
```

This starts:
| Service | Port | Dashboard |
|---------|------|-----------|
| PostgreSQL 16 | `5433` | — |
| RabbitMQ 3.13 | `5672` | [http://localhost:15672](http://localhost:15672) (iep/iep_secret) |
| Redis 7 | `6379` | — |
| MinIO | `9000` | [http://localhost:9001](http://localhost:9001) (minioadmin/minioadmin) |

### 4. Run Database Migration

```bash
npm run db:migrate:dev -- --name init
```

### 5. Seed Development Tenant

```bash
npm run db:seed
```

This creates a tenant with API key: **`iep-dev-api-key-12345`**

### 6. Start Services

Open two terminals:

**Terminal 1 — Mail API:**
```bash
npm run start:dev:api
```

**Terminal 2 — Mail Worker:**
```bash
npm run start:dev:worker
```

### 7. Verify

- **Swagger Docs:** [http://localhost:3000/docs](http://localhost:3000/docs)
- **Health Check:** [http://localhost:3000/health/live](http://localhost:3000/health/live)
- **RabbitMQ Management:** [http://localhost:15672](http://localhost:15672)

---

## 📖 API Reference

### Base URL

```
http://localhost:3000/v1
```

### Authentication

All endpoints (except health) require the `x-api-key` header:

```
x-api-key: iep-dev-api-key-12345
```

### Swagger / OpenAPI

Interactive API documentation is available at:

```
http://localhost:3000/docs
```

The Swagger UI lets you:
- View all endpoints with full request/response schemas
- Try out API calls directly from the browser
- Download the OpenAPI JSON spec

---

### Endpoints

#### `POST /v1/messages` — Send an Email

Accepts a message for delivery. Returns `202 Accepted` for new messages, `200 OK` for idempotent duplicates.

**Request:**

```bash
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: iep-dev-api-key-12345" \
  -d '{
    "from": {
      "email": "noreply@example.com",
      "name": "My App"
    },
    "to": [
      { "email": "user@example.com", "name": "John Doe" }
    ],
    "cc": [
      { "email": "manager@example.com" }
    ],
    "subject": "Welcome, {{name}}!",
    "htmlBody": "<h1>Hello {{name}}</h1><p>Welcome to our platform.</p>",
    "textBody": "Hello {{name}}, welcome to our platform.",
    "variables": {
      "name": "John"
    },
    "priority": "normal",
    "idempotencyKey": "welcome-john-2024-01-01"
  }'
```

**Response (202):**

```json
{
  "statusCode": 202,
  "message": "Message accepted for delivery",
  "data": {
    "id": "a1b2c3d4-...",
    "status": "queued",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Idempotent Duplicate Response (200):**

```json
{
  "statusCode": 200,
  "message": "Message already created with this idempotency key",
  "data": {
    "id": "a1b2c3d4-...",
    "status": "sent",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

#### `GET /v1/messages/:id` — Get Message Status

```bash
curl http://localhost:3000/v1/messages/MESSAGE_ID \
  -H "x-api-key: iep-dev-api-key-12345"
```

**Response:**

```json
{
  "id": "a1b2c3d4-...",
  "status": "sent",
  "priority": "normal",
  "fromEmail": "noreply@example.com",
  "fromName": "My App",
  "subject": "Welcome, {{name}}!",
  "recipients": [
    { "type": "to", "email": "user@example.com", "name": "John Doe" },
    { "type": "cc", "email": "manager@example.com", "name": null }
  ],
  "providerName": "smtp",
  "attemptCount": 1,
  "sentAt": "2024-01-01T00:00:05.000Z",
  "events": [
    { "eventType": "message.queued", "createdAt": "..." },
    { "eventType": "message.processing", "createdAt": "..." },
    { "eventType": "message.sent", "createdAt": "..." }
  ],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:05.000Z"
}
```

---

#### `GET /v1/messages` — List Messages (Paginated)

```bash
curl "http://localhost:3000/v1/messages?status=sent&page=1&limit=20" \
  -H "x-api-key: iep-dev-api-key-12345"
```

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | — | Filter by status: `queued`, `processing`, `sent`, `failed`, `bounced` |
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Items per page |

---

#### `GET /health/live` — Liveness Probe

```bash
curl http://localhost:3000/health/live
```

Returns `200 OK` if the process is alive.

---

#### `GET /health/ready` — Readiness Probe

```bash
curl http://localhost:3000/health/ready
```

Returns `200 OK` if PostgreSQL and RabbitMQ are healthy.

---

## 🗄️ Database Schema

| Table | Description |
|-------|-------------|
| `tenants` | API key holders with rate limits |
| `messages` | Email messages with raw + rendered content |
| `message_recipients` | TO, CC, BCC recipients per message |
| `attachments` | S3/MinIO file references |
| `message_events` | Audit trail (queued → processing → sent/failed) |
| `suppression_list` | Bounced/suppressed emails per tenant |

Manage the database:

```bash
# Open Prisma Studio (visual DB browser)
npm run db:studio

# Create a new migration
npm run db:migrate:dev -- --name your_migration_name

# Apply migrations in production
npm run db:migrate:deploy
```

---

## 🔄 Message Lifecycle

```
1. Client sends POST /v1/messages
2. API validates input, checks idempotency, stores in DB
3. API publishes message ID to RabbitMQ
4. Worker picks up the message
5. Worker checks suppression list
6. Worker renders Handlebars templates
7. Worker sends via SMTP provider
8. Worker updates status to "sent" or handles retry/failure
```

**Retry Flow (DLX + TTL):**

```
Main Queue → NACK → Dead Letter Exchange → Retry Queue (10s TTL)
                                          → Retry Queue (1m TTL)
                                          → Retry Queue (5m TTL)
             → After TTL expires → Back to Main Queue
```

---

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `npm run start:dev:api` | Start Mail API in watch mode |
| `npm run start:dev:worker` | Start Mail Worker in watch mode |
| `npm run build:api` | Build Mail API for production |
| `npm run build:worker` | Build Mail Worker for production |
| `npm run db:migrate:dev` | Run Prisma migrations (dev) |
| `npm run db:migrate:deploy` | Run Prisma migrations (prod) |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run db:seed` | Seed development tenant |
| `npm run db:generate` | Regenerate Prisma Client |
| `npm run test` | Run unit tests |
| `npm run test:e2e:api` | Run E2E tests for Mail API |
| `npm run docker:up` | Start all Docker services |
| `npm run docker:down` | Stop all Docker services |
| `npm run lint` | Lint and fix code |
| `npm run format` | Format code with Prettier |

---

## 🔧 Configuration

All configuration is managed through environment variables. See [`.env.example`](.env.example) for the full list.

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `3000` | Mail API port |
| `WORKER_PORT` | `3001` | Mail Worker port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `RABBITMQ_URL` | — | RabbitMQ AMQP URL |
| `REDIS_HOST` | `localhost` | Redis host |
| `SMTP_HOST` | `localhost` | SMTP server host |
| `SMTP_PORT` | `1025` | SMTP server port |
| `LOG_LEVEL` | `info` | Log level (`debug`, `info`, `warn`, `error`) |

---

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests (requires running infrastructure)
npm run test:e2e:api

# Test with coverage
npm run test:cov
```

---

## 📊 Technology Stack

| Category | Technology |
|----------|-----------|
| **Runtime** | Node.js, TypeScript |
| **Framework** | NestJS 11 (monorepo) |
| **Database** | PostgreSQL 16 + Prisma ORM |
| **Message Queue** | RabbitMQ 3.13 (amqplib) |
| **Cache** | Redis 7 (ioredis) |
| **Email** | Nodemailer (SMTP) |
| **Rendering** | Handlebars |
| **Logging** | Pino (nestjs-pino) |
| **Docs** | Swagger / OpenAPI |
| **Validation** | class-validator + class-transformer |
| **Health** | @nestjs/terminus |
| **Security** | Helmet, API key auth |

---

## 📝 License

This project is **UNLICENSED** — proprietary and confidential.
