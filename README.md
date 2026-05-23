# Task Management — Microservices Portfolio Project

![CI](https://github.com/chrishanpeiris/task-management/actions/workflows/ci.yml/badge.svg)

A production-style task management app built as a microservices system to demonstrate backend architecture skills including API gateway patterns, async job queues, MongoDB data ownership, and Kubernetes deployment.

**Tech stack:** Node.js · TypeScript · Express · Next.js · MongoDB · Redis · BullMQ · Docker · Kubernetes · GitHub Actions

---

## Architecture

```
Browser ──► Gateway (3001) ──► Auth Service (3002) ──► MongoDB: task-auth
                   │
                   └──────────► Task Service (3003) ──► MongoDB: task-tasks
                                       │
                                       └──────────────► Redis ──► BullMQ Worker
```

See [`docs/architecture.html`](docs/architecture.html) for the full interactive diagram.

### Key design decisions

| Decision | Why |
|---|---|
| **API Gateway validates JWT once** | Downstream services receive `X-User-Id/Email/Name` headers and trust them without re-validating. Works because services are ClusterIP (not internet-exposed). |
| **Each service owns its MongoDB database** | `task-auth` and `task-tasks` are separate databases. No cross-service joins. `userId` in task-service is a plain `string`, not an ObjectId ref. |
| **BullMQ + Redis for notifications** | Status change events are queued asynchronously — the HTTP response returns immediately. In production the worker runs as a separate Deployment with its own HPA. |
| **StatefulSet for MongoDB** | Databases need stable network identity and persistent storage, unlike stateless services (Deployment). |
| **HPA on task-service** | The most write-heavy service; scales 2–10 pods on CPU > 70%. |

---

## Project structure

```
task-management/
├── apps/
│   ├── gateway/          Express API gateway — JWT validation + reverse proxy
│   ├── auth-service/     User registration, login, JWT issuance
│   ├── task-service/     CRUD tasks + BullMQ notification queue
│   └── web/              Next.js 14 frontend
├── k8s/                  Kubernetes manifests
├── docs/                 Architecture diagram
├── docker-compose.yml    Local full-stack development
└── Makefile              Shortcuts for common commands
```

---

## Quick start

**Prerequisites:** Node 20, Docker

```bash
git clone https://github.com/chrishanpeiris/task-management
cd task-management

# Local dev with Docker Compose (all services + MongoDB + Redis)
make up
# or: docker compose up --build

# Open http://localhost:3000
```

**Run services individually:**

```bash
npm install

# Terminal 1 — infrastructure
docker compose up mongodb redis

# Terminal 2 — all services (concurrently)
npm run dev
```

---

## Testing

Tests use `mongodb-memory-server` — no running MongoDB required.

```bash
npm test                          # all services
npm test -w apps/auth-service     # auth only
npm test -w apps/task-service     # tasks only
```

---

## Kubernetes

```bash
# Apply all manifests (namespace → config → statefulset → deployments → ingress)
make k8s-apply

# Check status
make k8s-status

# Remove everything
make k8s-delete
```

Update image tags in `k8s/*.yaml` to match your GHCR images after CI pushes them.

---

## Environment variables

Each service has a `.env.example` at its root. Copy to `.env` for local dev:

```bash
cp apps/auth-service/.env.example  apps/auth-service/.env
cp apps/task-service/.env.example  apps/task-service/.env
cp apps/gateway/.env.example       apps/gateway/.env
cp apps/web/.env.local.example     apps/web/.env.local
```

---

## CI/CD

GitHub Actions pipeline (`.github/workflows/ci.yml`):

1. **Typecheck** — `tsc --noEmit` across all workspaces
2. **Test** — auth-service and task-service run in parallel
3. **Docker build + push** — all 4 images pushed to GHCR on `main`

Images are tagged as `:latest` and `:<git-sha>` for rollback.
