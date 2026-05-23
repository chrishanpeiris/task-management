# Task Management — Developer Guide

> Microservices · API Gateway · MongoDB · BullMQ · Kubernetes  
> Reference this when adding features, debugging, or preparing for interviews.

---

## Table of contents

1. [How the system is wired](#1-how-the-system-is-wired)
2. [Project structure](#2-project-structure)
3. [Request flows end-to-end](#3-request-flows-end-to-end)
4. [Key files and what they own](#4-key-files-and-what-they-own)
5. [How to add a feature](#5-how-to-add-a-feature)
6. [Architecture rules — never break these](#6-architecture-rules)
7. [Running locally](#7-running-locally)
8. [Testing](#8-testing)
9. [Interview playbook](#9-interview-playbook)

---

## 1. How the system is wired

```
Browser
  │
  ▼
Gateway :3001          ← only public entry point
  ├── /api/auth/*  ──► auth-service :3002 ──► MongoDB (task-auth)
  └── /api/tasks/* ──► task-service :3003 ──► MongoDB (task-tasks)
                                          └──► Redis :6379 ──► BullMQ worker
```

**The golden rule:** the gateway is the only service exposed to the internet.
All other services are ClusterIP in Kubernetes — no browser ever hits them directly.

---

## 2. Project structure

```
task-management/
├── apps/
│   ├── gateway/                 ← Edge: CORS, rate-limit, JWT validation, proxy
│   │   └── src/
│   │       ├── index.ts         ← Express setup, proxy routes
│   │       └── middleware/
│   │           └── auth.ts      ← jwtVerify → sets X-User-* headers
│   │
│   ├── auth-service/            ← Owns users and JWTs
│   │   └── src/
│   │       ├── index.ts         ← startServer() + app export
│   │       ├── models/User.ts   ← Mongoose schema
│   │       ├── routes/auth.ts   ← register, login, verify, me
│   │       └── __tests__/       ← Integration tests (mongodb-memory-server)
│   │
│   ├── task-service/            ← Owns tasks and notifications
│   │   └── src/
│   │       ├── index.ts         ← startServer() + SIGTERM handler
│   │       ├── models/Task.ts   ← Mongoose schema
│   │       ├── routes/tasks.ts  ← CRUD endpoints
│   │       ├── middleware/auth.ts ← reads X-User-* headers (no JWT)
│   │       ├── queue/taskQueue.ts ← BullMQ Queue + Worker
│   │       └── __tests__/       ← Integration tests
│   │
│   └── web/                     ← Next.js 14 frontend
│       └── src/
│           ├── app/
│           │   ├── page.tsx         ← redirects to /tasks or /login
│           │   ├── login/page.tsx   ← login + register form
│           │   └── tasks/page.tsx   ← task list (main UI)
│           ├── lib/api.ts           ← all fetch calls to the gateway
│           └── types/index.ts       ← Task, TaskStatus, TaskPriority
│
├── k8s/                         ← Kubernetes manifests
├── docker-compose.yml           ← Local full stack
├── Makefile                     ← Shortcut commands
└── package.json                 ← npm workspaces root
```

---

## 3. Request flows end-to-end

### Register / Login
```
POST /api/auth/register  { email, name, password }
  1. Gateway: no auth check, proxy → auth-service POST /auth/register
  2. auth-service: validate fields, bcrypt.hash(password, 10)
  3. User.create({ email, name, passwordHash })
  4. SignJWT({ sub: userId, email, name }).setExpirationTime('7d')
  5. Return { token, user: { id, email, name } }
  6. Browser: localStorage.setItem('auth_token', token)
```

### Fetch tasks (authenticated)
```
GET /api/tasks
  + Authorization: Bearer <jwt>

  1. Gateway middleware/auth.ts:
       jwtVerify(token, secret)  ← validates signature + expiry
       req.headers['x-user-id']    = payload.sub
       req.headers['x-user-email'] = payload.email
       req.headers['x-user-name']  = payload.name
  2. Proxy → task-service GET /tasks
  3. task-service middleware/auth.ts:
       reads x-user-id header (trusts it — no JWT re-validation)
  4. Task.find({ userId }).sort({ createdAt: -1 })
  5. Return { tasks: [...], total: n }
```

### Update task status (async notification)
```
PATCH /api/tasks/:id  { status: 'DONE' }

  1. Gateway: validate JWT, proxy to task-service
  2. task-service: Task.findOne({ _id, userId })
  3. task.status = 'DONE'; await task.save()
  4. Enqueue job: queue.add('status-changed', {
       type: 'STATUS_CHANGED',
       taskId, taskTitle, userId,
       payload: { from: 'IN_PROGRESS', to: 'DONE' }
     })
  5. Return updated task immediately  ← HTTP response is fast
  [background] BullMQ worker processes the job
               logs it / would email user in production
```

---

## 4. Key files and what they own

| File | Responsibility |
|---|---|
| `gateway/src/index.ts` | CORS, rate-limit, proxy routing, health endpoint |
| `gateway/src/middleware/auth.ts` | JWT validation — the only place JWTs are checked |
| `auth-service/src/routes/auth.ts` | register, login, verify, me — JWT signing lives here |
| `auth-service/src/models/User.ts` | User schema: email, name, passwordHash, timestamps |
| `task-service/src/routes/tasks.ts` | GET list, GET one, POST, PATCH, DELETE |
| `task-service/src/models/Task.ts` | Task schema + compound index (userId, createdAt) |
| `task-service/src/queue/taskQueue.ts` | BullMQ Queue + Worker — async side effects |
| `task-service/src/middleware/auth.ts` | Reads X-User-* headers, sets req.userId etc |
| `web/src/lib/api.ts` | All fetch calls — single place to update base URL or headers |
| `web/src/types/index.ts` | Task, TaskStatus, TaskPriority — shared frontend types |

---

## 5. How to add a feature

### Pattern: adding a field to tasks

Example: add a `dueDate` field (already exists — follow this pattern for anything new).

```
Step 1 — Model (task-service/src/models/Task.ts)
  Add field to Mongoose schema:
  dueDate: { type: Date }

Step 2 — Route (task-service/src/routes/tasks.ts)
  Accept in POST body:
  const { title, priority, dueDate } = req.body
  Task.create({ ..., dueDate: dueDate ? new Date(dueDate) : undefined })

  Accept in PATCH body:
  if (dueDate !== undefined) task.dueDate = dueDate ? new Date(dueDate) : undefined

Step 3 — Frontend type (web/src/types/index.ts)
  Add to Task interface:
  dueDate?: string

Step 4 — Frontend API (web/src/lib/api.ts)
  Add to createTask() params and body

Step 5 — UI (web/src/app/tasks/page.tsx)
  Add input to form, pass value to createTask()
```

**MongoDB is schemaless** — adding a field to the schema doesn't break existing documents.
Old documents will just have `undefined` for the new field.

---

### Pattern: adding a new endpoint to a service

Example: add `GET /api/tasks/stats` to return task counts by status.

```
Step 1 — Route handler (task-service/src/routes/tasks.ts)
  router.get('/stats', async (req, res) => {
    const { userId } = req as unknown as AuthRequest
    const stats = await Task.aggregate([
      { $match: { userId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
    res.json(stats)
  })

Step 2 — Frontend API (web/src/lib/api.ts)
  export async function fetchTaskStats() {
    const res = await fetch(`${BASE}/api/tasks/stats`, { headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to fetch stats')
    return res.json()
  }

Step 3 — UI — use it wherever needed
```

**No gateway change needed** — `/api/tasks/*` is already wildcard-proxied.

---

### Pattern: adding a completely new service

Example: a `notification-service` for emails.

```
Step 1 — Create apps/notification-service/ (copy auth-service structure)

Step 2 — Add to docker-compose.yml
  notification-service:
    build: { context: ., dockerfile: apps/notification-service/Dockerfile }
    environment:
      PORT: 3004
      ...

Step 3 — Add proxy route to gateway/src/index.ts
  app.use('/api/notifications',
    createProxyMiddleware({
      target: process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3004',
      changeOrigin: true,
      pathRewrite: (path) => '/notifications' + path,
      on: { proxyRes: stripUpstreamCors },
    })
  )

Step 4 — Add K8s manifests in k8s/notification-service.yaml

Step 5 — Add to CI matrix in .github/workflows/ci.yml
```

---

## 6. Architecture rules

**Rule 1 — JWT validation belongs only in the gateway**
Never call `jwtVerify` in auth-service or task-service routes.
They receive `x-user-id` / `x-user-email` / `x-user-name` headers and trust them.
This works because those services are not exposed to the internet.

**Rule 2 — Each service owns its own database**
`task-service` never connects to the `task-auth` MongoDB database.
`userId` in task-service is a plain `String`, not a Mongoose ObjectId ref.
If you need user data in a task response, denormalise it (store userName on the task).

**Rule 3 — HTTP responses must be fast**
Anything that could be slow (email, push notification, webhook) goes into BullMQ.
Enqueue the job → return the response → worker processes asynchronously.

**Rule 4 — Services have one reason to change**
auth-service changes when auth logic changes.
task-service changes when task logic changes.
If you're adding analytics, create an analytics-service — don't bolt it onto task-service.

---

## 7. Running locally

```bash
# Start databases
docker compose up mongodb redis -d

# Kill leftover processes (if ports are busy)
lsof -ti :3001 | xargs kill -9 2>/dev/null
lsof -ti :3002 | xargs kill -9 2>/dev/null
lsof -ti :3003 | xargs kill -9 2>/dev/null

# Start all 4 services with hot reload
npm run dev

# Open http://localhost:3000
```

**Port map:**
| Port | Service |
|---|---|
| 3000 | Next.js web |
| 3001 | Gateway |
| 3002 | auth-service |
| 3003 | task-service |
| 27017 | MongoDB |
| 6379 | Redis |

**Or use Docker Compose for everything:**
```bash
docker compose up --build
```

---

## 8. Testing

```bash
npm test                       # all services
npm test -w apps/auth-service  # auth only
npm test -w apps/task-service  # tasks only
```

Tests use `mongodb-memory-server` — no running MongoDB needed.

**How tests are structured (auth-service example):**
```typescript
// Start in-memory MongoDB before all tests
beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

// Use supertest — no ports, no real HTTP server
const res = await request(app)
  .post('/auth/register')
  .send({ email, name, password })

expect(res.status).toBe(201)
expect(res.body.token).toBeDefined()
```

**When to write a test:**
- Every new route gets at least: success case, validation failure, auth failure (401)
- Every new model method or service function gets a unit test

---

## 9. Interview playbook

### Walk me through the architecture

> "The system has four layers.
> **Edge** — the gateway owns CORS, rate limiting, and JWT validation. It's the only service the browser talks to.
> **Identity** — auth-service owns user accounts. It signs JWTs with HS256 and a shared secret.
> **Domain** — task-service owns tasks. It never re-validates JWTs — it trusts the X-User headers the gateway sets. This is safe because task-service is ClusterIP in Kubernetes.
> **Async** — BullMQ with Redis decouples HTTP responses from side effects. Status changes return immediately; the worker handles notifications."

### Why not one monolith?

> "Each service deploys independently. The task-service can scale horizontally (HPA 2–10 pods) without touching auth. They also fail independently — if the notification worker is down, task CRUD still works."

### How does auth work across services?

> "JWT is validated once at the gateway using `jose.jwtVerify`. The gateway then forwards identity as HTTP headers (`X-User-Id`, `X-User-Email`, `X-User-Name`). Downstream services read these headers and trust them — they're internal services not reachable from the internet, so the attack surface for header forgery is zero."

### What would you change at scale?

> "Three things:
> 1. Split the BullMQ worker into its own Deployment with its own HPA — right now it co-locates with task-service which couples their scaling.
> 2. Add a MongoDB read replica and route read queries there.
> 3. Add an event bus (Kafka or Redis Streams) so services can react to each other's events without direct coupling — e.g. analytics-service subscribes to task status changes."

### Why MongoDB and not PostgreSQL?

> "Tasks are a good fit for documents — they have a variable shape (tags, optional due date). MongoDB also lets me iterate on the schema without migrations, which matters early on. If I needed complex relational queries across services I'd reconsider."
