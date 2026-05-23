import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import authRouter from './routes/auth';

const app = express();
const port = Number(process.env.PORT ?? 3002);

app.use(cors({ origin: process.env.GATEWAY_URL ?? 'http://localhost:3001', credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));
app.use('/auth', authRouter);

export async function startServer(mongoUri?: string) {
  const uri = mongoUri ?? process.env.MONGODB_URI ?? 'mongodb://localhost:27017/task-auth';
  await mongoose.connect(uri);
  console.log('[auth-service] connected to MongoDB');
  return app.listen(port, () =>
    console.log(`[auth-service] running on http://localhost:${port}`),
  );
}

// Only start when run directly (not when imported in tests)
if (require.main === module) {
  startServer().catch((err) => {
    console.error('[auth-service] startup failed:', err);
    process.exit(1);
  });
}

export { app };
