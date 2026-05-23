import { Request, Response, NextFunction } from 'express';

/**
 * Auth middleware for task-service.
 *
 * The gateway has already validated the JWT and forwarded the user identity
 * as trusted headers (X-User-Id, X-User-Email, X-User-Name).
 *
 * This means task-service doesn't re-validate JWT signatures — it trusts the
 * gateway. This is the "sidecar / service mesh trust boundary" pattern:
 * validation happens at the edge (gateway), not in every downstream service.
 *
 * Interview talking point: this only works if the task-service is NOT exposed
 * directly to the internet — it should only be reachable from inside the cluster
 * (ClusterIP in K8s). The gateway is the only public entry point.
 */
export interface AuthRequest extends Request {
  userId: string;
  userEmail: string;
  userName: string;
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const userId = req.headers['x-user-id'] as string;
  const userEmail = req.headers['x-user-email'] as string;
  const userName = req.headers['x-user-name'] as string;

  if (!userId) {
    res.status(401).json({ error: 'Missing user context — request must come through the gateway' });
    return;
  }

  (req as AuthRequest).userId = userId;
  (req as AuthRequest).userEmail = userEmail;
  (req as AuthRequest).userName = userName;
  next();
}
