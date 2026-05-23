import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify } from 'jose';
import { User } from '../models/User';

const router = Router();
const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

// ── Register ─────────────────────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response) => {
  const { email, name, password } = req.body as { email?: string; name?: string; password?: string };
  if (!email || !name || !password) {
    res.status(400).json({ error: 'email, name and password are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' });
    return;
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    res.status(409).json({ error: 'email already in use' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, name, passwordHash });

  const token = await signToken(user.id, user.email, user.name);
  res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = await signToken(user.id, user.email, user.name);
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

// ── Verify (called by gateway to validate tokens) ────────────────────────────
router.post('/verify', async (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token) {
    res.status(400).json({ error: 'token is required' });
    return;
  }
  try {
    const { payload } = await jwtVerify(token, secret);
    res.json({ valid: true, userId: payload.sub, email: payload.email, name: payload.name });
  } catch {
    res.status(401).json({ valid: false, error: 'Invalid or expired token' });
  }
});

// ── Me ────────────────────────────────────────────────────────────────────────
router.get('/me', async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }
  try {
    const { payload } = await jwtVerify(auth.slice(7), secret);
    const user = await User.findById(payload.sub).select('-passwordHash');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ id: user.id, email: user.email, name: user.name });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

async function signToken(userId: string, email: string, name: string) {
  return new SignJWT({ sub: userId, email, name })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret);
}

export default router;
