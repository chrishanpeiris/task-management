/**
 * Integration tests for auth-service routes.
 *
 * We use mongodb-memory-server to spin up a real (in-process) MongoDB instance.
 * This tests the full stack — routing, validation, bcrypt, JWT, Mongoose — without
 * needing a running database server. Each test suite gets a clean database.
 *
 * Interview talking point: these are integration tests, not unit tests. We're not
 * mocking Mongoose or bcrypt — we're testing the actual behaviour of the route.
 */
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../index';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  // Clear all collections between tests for isolation
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe('POST /auth/register', () => {
  it('creates a user and returns a JWT', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'alice@example.com', name: 'Alice', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 409 when email already exists', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'bob@example.com', name: 'Bob', password: 'password123' });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'bob@example.com', name: 'Bob Again', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already in use/);
  });

  it('returns 400 for short password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'carol@example.com', name: 'Carol', password: 'short' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'dave@example.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'eve@example.com', name: 'Eve', password: 'password123' });
  });

  it('returns a JWT on valid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'eve@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('eve@example.com');
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'eve@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  it('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
  });
});

describe('POST /auth/verify', () => {
  it('returns valid:true for a good token', async () => {
    const loginRes = await request(app)
      .post('/auth/register')
      .send({ email: 'frank@example.com', name: 'Frank', password: 'password123' });

    const res = await request(app)
      .post('/auth/verify')
      .send({ token: loginRes.body.token });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.email).toBe('frank@example.com');
  });

  it('returns valid:false for a tampered token', async () => {
    const res = await request(app)
      .post('/auth/verify')
      .send({ token: 'not.a.valid.jwt' });

    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
  });
});
