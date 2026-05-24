# Task Management — Testing Guide

**Stack:** Jest + Supertest + mongodb-memory-server (integration tests for Node.js services)

This project tests the **backend services** (auth-service, task-service), not the Next.js frontend. The tests are integration tests — they spin up a real in-memory MongoDB and fire actual HTTP requests through Express, so the full stack (routing → validation → database) is exercised without any external dependencies.

---

## Commands

```bash
# From the repo root — runs tests in all services
npm test

# From a specific service
cd apps/auth-service && npm test
cd apps/task-service && npm test

# Watch mode (inside a service)
npm run test:watch

# Coverage
npm run test:coverage
```

---

## How it's wired up

```
apps/auth-service/
├── jest.config.js               — Jest config, ts-jest transform
├── src/__tests__/
│   └── auth.test.ts             — Integration tests for /auth/* routes

apps/task-service/
├── jest.config.js
├── src/__tests__/
│   └── tasks.test.ts            — Integration tests for /tasks/* routes
```

Each test file:
1. Starts `MongoMemoryServer` in `beforeAll` — a real MongoDB running in-process
2. Connects Mongoose to it
3. Clears all collections in `afterEach` — each test starts with a clean DB
4. Disconnects and stops Mongo in `afterAll`

---

## Why integration tests here (not unit tests)?

These services are mostly routing + validation + DB writes. Mocking Mongoose would leave too little real behaviour to test. `mongodb-memory-server` gives us a real database with zero infrastructure — it downloads a MongoDB binary on first run and keeps it cached.

**Interview talking point:** unit tests mock dependencies; integration tests test real behaviour with controlled infrastructure. Both are valid — the right choice depends on what you're testing.

---

## Pattern 1 — Testing an API route (the main pattern)

```ts
// src/__tests__/auth.test.ts
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../index';

let mongod: MongoMemoryServer;

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  // Clear all collections so tests don't bleed into each other
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('creates a user and returns a JWT', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'alice@example.com', name: 'Alice', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@example.com');
    // Security: password hash must never be returned
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 409 when the email is already registered', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'bob@example.com', name: 'Bob', password: 'password123' });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'bob@example.com', name: 'Bob Again', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already in use/);
  });

  it('returns 400 for a password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'carol@example.com', name: 'Carol', password: 'short' });

    expect(res.status).toBe(400);
  });
});
```

**`supertest` cheat sheet:**

| Method | Purpose |
|---|---|
| `request(app).get('/path')` | GET request |
| `request(app).post('/path').send({ ... })` | POST with JSON body |
| `.set('Authorization', 'Bearer token')` | Add a request header |
| `res.status` | HTTP status code |
| `res.body` | Parsed JSON response body |

---

## Pattern 2 — Testing an authenticated route

First register/login to get a token, then use it in subsequent requests:

```ts
describe('POST /tasks', () => {
  let token: string;

  beforeEach(async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@example.com', name: 'User', password: 'password123' });
    token = res.body.token;
  });

  it('creates a task for the authenticated user', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Write tests', priority: 'HIGH' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Write tests');
    expect(res.body.priority).toBe('HIGH');
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'No auth task' });

    expect(res.status).toBe(401);
  });
});
```

---

## Pattern 3 — Testing validation rules

```ts
describe('Input validation', () => {
  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ priority: 'HIGH' }); // no title

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 for an invalid priority value', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Bad task', priority: 'CRITICAL' }); // not a valid enum

    expect(res.status).toBe(400);
  });
});
```

---

## Pattern 4 — Testing a service function directly (unit test)

If a function has no DB dependency, test it as a pure unit:

```ts
// src/__tests__/utils/jwt.test.ts
import { signToken, verifyToken } from '../utils/jwt';

describe('JWT utils', () => {
  it('signs and verifies a payload round-trip', async () => {
    const payload = { userId: 'abc123', email: 'test@example.com' };
    const token = await signToken(payload);
    const decoded = await verifyToken(token);
    expect(decoded.userId).toBe('abc123');
  });

  it('throws on a tampered token', async () => {
    await expect(verifyToken('not.a.real.token')).rejects.toThrow();
  });
});
```

---

## Pattern 5 — Mocking external services

If a route calls an external service (e.g. email, Stripe), mock the module so tests don't make real HTTP calls:

```ts
jest.mock('../services/emailService', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
}));

import { sendWelcomeEmail } from '../services/emailService';

it('sends a welcome email after registration', async () => {
  await request(app)
    .post('/auth/register')
    .send({ email: 'new@example.com', name: 'New', password: 'password123' });

  expect(sendWelcomeEmail).toHaveBeenCalledWith('new@example.com', 'New');
});
```

---

## What's already tested

| File | Tests |
|---|---|
| `auth-service/src/__tests__/auth.test.ts` | Register, login, token verify — happy paths + error cases |
| `task-service/src/__tests__/tasks.test.ts` | CRUD for tasks, auth guard, status transitions |

---

## Adding a new test

1. Create `src/__tests__/<name>.test.ts` inside the relevant service
2. Follow the `beforeAll` / `afterEach` / `afterAll` lifecycle pattern above
3. Run `npm run test:watch` inside that service directory

**Naming conventions:**
- One `describe` block per route or feature group
- Test names follow: `'[verb] [subject] [condition]'` — e.g. `'returns 401 when token is expired'`
- Always test the error cases — they're more likely to be forgotten
