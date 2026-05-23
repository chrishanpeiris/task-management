/**
 * Integration tests for task-service routes.
 *
 * We simulate the gateway by manually setting the X-User-* headers that the
 * auth middleware reads. This tests the full route → model → MongoDB cycle
 * without needing a running gateway or JWT.
 */
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../index';

let mongod: MongoMemoryServer;

const USER_HEADERS = {
  'x-user-id':    'user-123',
  'x-user-email': 'test@example.com',
  'x-user-name':  'Test User',
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe('GET /tasks', () => {
  it('returns empty list when user has no tasks', async () => {
    const res = await request(app).get('/tasks').set(USER_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(0);
  });

  it('returns 401 without user headers', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(401);
  });
});

describe('POST /tasks', () => {
  it('creates a task and returns 201', async () => {
    const res = await request(app)
      .post('/tasks')
      .set(USER_HEADERS)
      .send({ title: 'Write tests', priority: 'HIGH' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Write tests');
    expect(res.body.priority).toBe('HIGH');
    expect(res.body.status).toBe('TODO');
    expect(res.body.userId).toBe('user-123');
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/tasks')
      .set(USER_HEADERS)
      .send({ priority: 'HIGH' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /tasks/:id', () => {
  it('updates task status', async () => {
    const created = await request(app)
      .post('/tasks')
      .set(USER_HEADERS)
      .send({ title: 'Initial task' });

    const taskId = created.body._id as string;

    const res = await request(app)
      .patch(`/tasks/${taskId}`)
      .set(USER_HEADERS)
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
  });

  it('returns 404 when task belongs to different user', async () => {
    const created = await request(app)
      .post('/tasks')
      .set(USER_HEADERS)
      .send({ title: 'My task' });

    const taskId = created.body._id as string;

    const res = await request(app)
      .patch(`/tasks/${taskId}`)
      .set({ 'x-user-id': 'other-user', 'x-user-email': 'other@example.com', 'x-user-name': 'Other' })
      .send({ status: 'DONE' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /tasks/:id', () => {
  it('deletes a task and returns 204', async () => {
    const created = await request(app)
      .post('/tasks')
      .set(USER_HEADERS)
      .send({ title: 'To be deleted' });

    const taskId = created.body._id as string;

    const res = await request(app).delete(`/tasks/${taskId}`).set(USER_HEADERS);
    expect(res.status).toBe(204);

    const fetched = await request(app).get(`/tasks/${taskId}`).set(USER_HEADERS);
    expect(fetched.status).toBe(404);
  });
});

describe('GET /tasks — filtering', () => {
  beforeEach(async () => {
    await request(app).post('/tasks').set(USER_HEADERS).send({ title: 'Task A', priority: 'HIGH' });
    await request(app).post('/tasks').set(USER_HEADERS).send({ title: 'Task B', priority: 'LOW' });
  });

  it('filters by priority', async () => {
    const res = await request(app).get('/tasks?priority=HIGH').set(USER_HEADERS);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].title).toBe('Task A');
  });
});
