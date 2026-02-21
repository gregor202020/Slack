# The Smoker

Internal communications platform for the **Third Wave BBQ** franchise network. A real-time messaging system built as a Slack-like workspace, designed for franchise-wide coordination across locations.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + npm workspaces |
| API | Fastify 5, Node.js 20+ |
| Web | Next.js 15, React 19, Tailwind CSS 4 |
| Mobile | Expo 52, React Native 0.76 |
| Database | PostgreSQL 16, Drizzle ORM |
| Cache / Pub-Sub | Redis 7 |
| Real-time | Socket.io 4.8 (with Redis adapter) |
| File Storage | S3-compatible (MinIO local, DigitalOcean Spaces prod) |
| Auth | JWT (access + refresh tokens), OTP via Twilio |
| Monitoring | Prometheus + Grafana |
| Testing | Vitest, Playwright, k6 |

## Monorepo Structure

```
the-smoker/
├── apps/
│   ├── api/          # @smoker/api — Fastify 5 REST + WebSocket server
│   ├── web/          # @smoker/web — Next.js 15 web client
│   └── mobile/       # @smoker/mobile — Expo / React Native mobile app
├── packages/
│   ├── shared/       # @smoker/shared — Zod schemas, constants, validation
│   └── db/           # @smoker/db — Drizzle ORM schema, migrations, seed
├── monitoring/
│   ├── prometheus/   # Prometheus scrape config
│   └── grafana/      # Grafana provisioning + dashboards
├── load-tests/       # k6 load testing scripts (smoke, load, stress)
├── nginx/            # Nginx reverse proxy configs (dev + prod)
├── scripts/          # Database backup/restore shell scripts
├── docker-compose.yml        # Production full-stack deployment
├── docker-compose.dev.yml    # Development infrastructure (postgres, redis, minio)
├── Makefile                  # Convenience targets for common operations
└── turbo.json                # Turborepo pipeline configuration
```

### Package Descriptions

- **`@smoker/api`** — Fastify 5 server providing REST endpoints, WebSocket real-time messaging via Socket.io, JWT authentication, file uploads (S3-compatible), rate limiting, CSRF protection, Swagger API docs, and Prometheus metrics.
- **`@smoker/web`** — Next.js 15 App Router web client with React 19, Zustand state management, Socket.io client for real-time updates, and Tailwind CSS 4 styling.
- **`@smoker/mobile`** — Expo 52 React Native mobile app with Expo Router navigation, push notifications, secure token storage, and Socket.io client.
- **`@smoker/shared`** — Shared Zod validation schemas, application constants, rate limit definitions, and blocked file extension lists. Consumed by both API and clients.
- **`@smoker/db`** — Drizzle ORM database layer with PostgreSQL 16 schema definitions, migration files, and seed data scripts.

## Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.9.0
- **Docker** and **Docker Compose** (for infrastructure services)
- **k6** (optional, for load testing)

### Setup

```bash
# 1. Clone the repository
git clone <repository-url> the-smoker
cd the-smoker

# 2. Install dependencies
npm install

# 3. Copy environment file and configure
cp .env.example .env
# Edit .env with your values (defaults work for local development)

# 4. Start infrastructure (PostgreSQL, Redis, MinIO)
make infra

# 5. Run database migrations and seed data
make db-setup

# 6. Start all apps in development mode
make dev
```

The API will be available at `http://localhost:4000` and the web app at `http://localhost:3000`.

### One-Command Development

```bash
# Start infra + run all apps (migrations must be done first)
make dev
```

## Make Targets

| Target | Description |
|--------|------------|
| `make dev` | Start infrastructure + all apps in development mode |
| `make infra` | Start development infrastructure (postgres, redis, minio) |
| `make infra-down` | Stop development infrastructure |
| `make db-setup` | Run database migrations + seed (starts infra first) |
| `make db-seed` | Re-seed the database only |
| `make build` | Build all packages via Turborepo |
| `make test` | Run unit tests across all packages |
| `make e2e` | Run Playwright E2E tests (Chromium) |
| `make up` | Build and start full production stack via Docker Compose |
| `make down` | Stop production Docker Compose stack |
| `make nginx` | Start development Nginx reverse proxy |
| `make nginx-down` | Stop development Nginx proxy |
| `make monitoring` | Start Prometheus + Grafana monitoring stack |
| `make monitoring-down` | Stop monitoring stack |
| `make load-smoke` | Run k6 smoke test |
| `make load-test` | Run k6 load test |
| `make load-stress` | Run k6 stress test |
| `make load-spike` | Run k6 spike test |
| `make backup` | Run database backup via host pg_dump |
| `make backup-docker` | Run database backup via Docker container |
| `make restore FILE=<path>` | Restore database from backup file |
| `make clean` | Full cleanup — remove all containers and volumes |

## Environment Variables

### Core

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://smoker:smoker_dev@localhost:5432/smoker` |
| `REDIS_URL` | Yes | Redis connection string | `redis://localhost:6379` |
| `PORT` | No | API server port | `4000` |
| `HOST` | No | API server bind address | `0.0.0.0` |
| `NODE_ENV` | No | Environment mode | `development` |
| `API_URL` | No | Public API URL | `http://localhost:4000` |
| `WEB_URL` | No | Public web app URL | `http://localhost:3000` |

### Authentication

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `JWT_SECRET` | Yes | Secret for signing JWT tokens (min 32 chars) | — |
| `JWT_ACCESS_EXPIRY` | No | Access token lifetime | `15m` |
| `JWT_REFRESH_EXPIRY` | No | Refresh token lifetime | `7d` |
| `OTP_LENGTH` | No | One-time password digit count | `6` |
| `OTP_EXPIRY_MINUTES` | No | OTP validity window in minutes | `5` |

### SMS (Twilio)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `TWILIO_ACCOUNT_SID` | No | Twilio account SID (required for SMS OTP) | — |
| `TWILIO_AUTH_TOKEN` | No | Twilio auth token | — |
| `TWILIO_FROM_NUMBER` | No | Twilio sender phone number | — |

### File Storage (S3-compatible)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `S3_ENDPOINT` | No | S3 endpoint URL | — |
| `S3_REGION` | No | S3 region | `us-east-1` |
| `S3_BUCKET` | No | S3 bucket name | `smoker-files` |
| `S3_ACCESS_KEY` | No | S3 access key | — |
| `S3_SECRET_KEY` | No | S3 secret key | — |
| `S3_FILE_DOMAIN` | No | Public domain for serving uploaded files | — |

### Security

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `PII_ENCRYPTION_KEY` | Yes | AES encryption key for PII fields (32-byte hex) | — |
| `INVITE_HMAC_SECRET` | Yes | HMAC secret for invite token signing | — |

### Web Client

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Yes | API URL accessible from the browser | `http://localhost:4000` |

### Database Backups

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BACKUP_DIR` | No | Local backup directory | `./backups` |
| `BACKUP_RETENTION` | No | Number of backup files to retain | `7` |
| `BACKUP_S3_ENDPOINT` | No | S3 endpoint for offsite backups | — |
| `BACKUP_S3_BUCKET` | No | S3 bucket for backups | — |
| `BACKUP_S3_ACCESS_KEY` | No | S3 access key for backups | — |
| `BACKUP_S3_SECRET_KEY` | No | S3 secret key for backups | — |
| `BACKUP_S3_REGION` | No | S3 region for backups | — |

### Error Tracking (optional)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `SENTRY_DSN` | No | Sentry DSN for error reporting. If not set, errors are only logged locally. | — |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN for the web client (browser-side). | — |

### Logging (optional)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `LOG_LEVEL` | No | Pino log level (debug, info, warn, error, fatal) | `debug` (dev) / `info` (prod) |
| `LOG_FILE` | No | File path to write logs to (in addition to stdout) | — |
| `LOG_MAX_SIZE` | No | Max log file size before rotation (e.g., `10m`, `100m`) | `10m` |

## Docker Deployment

### Production (full stack)

```bash
# Build and start all services (postgres, redis, minio, api, web, nginx)
docker compose up --build -d

# Or use the Make target
make up

# Stop everything
make down
```

### Development (infrastructure only)

```bash
# Start postgres, redis, and minio for local development
make infra

# Run apps locally with hot-reload
make dev
```

## Database Operations

```bash
# Generate Drizzle migration files from schema changes
npm run db:generate

# Apply pending migrations
npm run db:migrate

# Seed the database with initial data
npm run db:seed

# Open Drizzle Studio (database GUI)
npm run db:studio

# Combined: migrate + seed (also starts infra)
make db-setup

# Backup (host-based, requires pg_dump)
make backup

# Backup (via Docker, no local pg_dump needed)
make backup-docker

# Restore from backup
make restore FILE=backups/smoker-backup-2025-01-15-120000.dump.gz
```

## API Documentation

When the API is running, interactive Swagger documentation is available at:

```
http://localhost:4000/docs
```

The API also exposes:

- `GET /health` — Health check with database and Redis connectivity status
- `GET /api/metrics` — JSON application metrics (request counts, response times, WebSocket connections)
- `GET /metrics` — Prometheus-format metrics endpoint for scraping

## Monitoring

Start the monitoring stack with:

```bash
make monitoring
```

| Service | URL | Credentials |
|---------|-----|-------------|
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3001 | admin / admin |

### Grafana Dashboards

Pre-configured dashboards are auto-provisioned:

- **API Overview** — Uptime, request rate, error rates (4xx/5xx), response time percentiles, memory/CPU usage, WebSocket connections, database and Redis status.
- **Business Metrics** — Active users (DAU estimate), messages per hour, channel activity, WebSocket connection trends, API endpoint breakdown, error rate by endpoint.

## Testing

### Unit Tests

```bash
# Run all unit tests
make test

# Run with watch mode (API only)
cd apps/api && npm run test:watch

# Run with coverage
cd apps/api && npm run test:coverage
```

### End-to-End Tests

```bash
# Run Playwright E2E tests (Chromium)
make e2e

# Run with UI mode
cd apps/web && npm run e2e:ui

# Run headed (visible browser)
cd apps/web && npm run e2e:headed
```

### Load Tests

Requires [k6](https://k6.io/) to be installed.

```bash
# Quick smoke test (minimal load, verify endpoints work)
make load-smoke

# Standard load test
make load-test

# Stress test (find breaking points)
make load-stress

# Spike test (sudden traffic spikes with recovery periods)
make load-spike
```

## Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Web App    │     │  Mobile App  │     │   Nginx      │
│  (Next.js)   │     │   (Expo)     │     │  (Reverse    │
│  :3000       │     │              │     │   Proxy)     │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                   ┌────────▼────────┐
                   │    API Server   │
                   │   (Fastify 5)   │
                   │    :4000        │
                   │  REST + WS      │
                   └───┬────────┬───┘
                       │        │
              ┌────────▼──┐  ┌──▼────────┐
              │ PostgreSQL │  │   Redis   │
              │    :5432   │  │   :6379   │
              │  (Drizzle) │  │ (pub/sub  │
              │            │  │  + cache) │
              └────────────┘  └───────────┘
                       │
              ┌────────▼──┐
              │   MinIO    │
              │   :9000    │
              │ (S3 files) │
              └────────────┘
```

- **Clients** (Web + Mobile) connect to the API over HTTP for REST calls and upgrade to WebSocket for real-time messaging.
- **Redis** serves as both a cache layer and the Socket.io pub/sub adapter, enabling horizontal API scaling.
- **PostgreSQL** stores all persistent data: users, organizations, channels, messages, threads, reactions, and file metadata.
- **MinIO / S3** handles file uploads (images, documents, avatars) with presigned URL generation.
- **Nginx** acts as a reverse proxy in production, terminating TLS and routing traffic to the API and web services.
- **Prometheus** scrapes the `/metrics` endpoint for time-series monitoring data.
- **Grafana** visualizes metrics through pre-configured dashboards.

## License

Private — Internal use only.
