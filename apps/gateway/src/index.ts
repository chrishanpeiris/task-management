import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authenticate } from './middleware/auth';

const app = express();
const port = Number(process.env.PORT ?? 3001);

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3002';
const TASK_SERVICE_URL = process.env.TASK_SERVICE_URL ?? 'http://localhost:3003';

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.WEB_URL ?? 'http://localhost:3000', credentials: true }));

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use(limiter);

// Request logging
app.use((req, _res, next) => {
  console.log(`[gateway] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'gateway' }));

// ── Auth routes (no JWT required) ─────────────────────────────────────────────
app.use(
  '/api/auth',
  createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/api/auth': '/auth' },
  }),
);

// ── Protected routes (JWT required) ──────────────────────────────────────────
// All routes below this line require a valid JWT.
app.use(authenticate);

app.use(
  '/api/tasks',
  createProxyMiddleware({
    target: TASK_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/api/tasks': '/tasks' },
  }),
);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`[gateway] running on http://localhost:${port}`);
  console.log(`[gateway]   auth-service → ${AUTH_SERVICE_URL}`);
  console.log(`[gateway]   task-service → ${TASK_SERVICE_URL}`);
});
