import { Request, Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret-change-in-production');

/**
 * JWT validation at the gateway boundary.
 *
 * This runs ONCE per inbound request. If valid, we forward the user identity
 * as trusted headers (X-User-Id, X-User-Email, X-User-Name) to downstream
 * services. Downstream services never need to re-validate the JWT signature —
 * they simply read these headers (trusting that only the gateway can set them,
 * because downstream services are not exposed to the internet).
 *
 * Routes that don't require auth (POST /api/auth/register, POST /api/auth/login)
 * skip this middleware via the router setup.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  try {
    const { payload } = await jwtVerify(auth.slice(7), secret);
    // Forward identity as trusted headers — downstream services read these
    req.headers['x-user-id']    = (payload.sub   ?? '') as string;
    req.headers['x-user-email'] = (payload.email ?? '') as string;
    req.headers['x-user-name']  = (payload.name  ?? '') as string;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
