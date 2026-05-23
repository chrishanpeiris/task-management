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
// In production: only allow the configured WEB_URL origin.
// In development: allow any localhost origin so port-bumps don't break CORS.
const isProd = process.env.NODE_ENV === 'production';
app.use(cors({
  origin: isProd
    ? (process.env.WEB_URL ?? 'http://localhost:3000')
    : (origin: string | undefined, cb: (e: Error | null, allow?: boolean) => void) => {
        if (!origin || origin.startsWith('http://localhost')) cb(null, true);
        else cb(new Error('Not allowed by CORS'));
      },
  credentials: true,
}));

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use(limiter);

// Request logging
app.use((req, _res, next) => {
  console.log(`[gateway] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'gateway' }));

// Strip CORS headers from upstream responses — the gateway is the sole CORS
// authority. Without this, internal services' own cors() middleware would send
// Access-Control-Allow-Origin headers that override the gateway's headers.
function stripUpstreamCors(proxyRes: import('http').IncomingMessage) {
  delete proxyRes.headers['access-control-allow-origin'];
  delete proxyRes.headers['access-control-allow-credentials'];
  delete proxyRes.headers['access-control-allow-methods'];
  delete proxyRes.headers['access-control-allow-headers'];
}

// ── Auth routes (no JWT required) ─────────────────────────────────────────────
// NOTE: Express strips the mount prefix before handing req.url to the proxy,
// so the proxy sees /register not /api/auth/register. We prepend /auth here.
app.use(
  '/api/auth',
  createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => '/auth' + path,
    on: { proxyRes: stripUpstreamCors },
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
    pathRewrite: (path) => '/tasks' + path,
    on: { proxyRes: stripUpstreamCors },
  }),
);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`[gateway] running on http://localhost:${port}`);
  console.log(`[gateway]   auth-service → ${AUTH_SERVICE_URL}`);
  console.log(`[gateway]   task-service → ${TASK_SERVICE_URL}`);
});
