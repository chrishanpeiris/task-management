import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import tasksRouter from './routes/tasks';
import { initQueue, closeQueue } from './queue/taskQueue';

const app = express();
const port = Number(process.env.PORT ?? 3003);

app.use(cors({ origin: process.env.GATEWAY_URL ?? 'http://localhost:3001', credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'task-service' }));
app.use('/tasks', tasksRouter);

export async function startServer(mongoUri?: string) {
  const uri = mongoUri ?? process.env.MONGODB_URI ?? 'mongodb://localhost:27017/task-tasks';
  await mongoose.connect(uri);
  console.log('[task-service] connected to MongoDB');

  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  initQueue(redisUrl);

  return app.listen(port, () =>
    console.log(`[task-service] running on http://localhost:${port}`),
  );
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[task-service] startup failed:', err);
    process.exit(1);
  });
}

process.on('SIGTERM', async () => {
  await closeQueue();
  process.exit(0);
});

export { app };
