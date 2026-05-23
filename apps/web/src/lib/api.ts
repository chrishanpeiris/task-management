const BASE = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:3001';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Login failed');
  const data = await res.json() as { token: string; user: { id: string; email: string; name: string } };
  localStorage.setItem('auth_token', data.token);
  return data;
}

export async function register(email: string, name: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Registration failed');
  const data = await res.json() as { token: string; user: { id: string; email: string; name: string } };
  localStorage.setItem('auth_token', data.token);
  return data;
}

export async function fetchTasks(filters?: { status?: string; priority?: string }) {
  const params = new URLSearchParams();
  if (filters?.status)   params.set('status', filters.status);
  if (filters?.priority) params.set('priority', filters.priority);
  const res = await fetch(`${BASE}/api/tasks?${params}`, { headers: authHeaders() });
  if (res.status === 401) { localStorage.removeItem('auth_token'); window.location.href = '/login'; }
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json() as Promise<{ tasks: import('@/types').Task[]; total: number }>;
}

export async function createTask(data: { title: string; priority: string; dueDate?: string; tags?: string[] }) {
  const res = await fetch(`${BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create task');
  return res.json() as Promise<import('@/types').Task>;
}

export async function updateTask(id: string, data: Partial<{ title: string; status: string; priority: string; dueDate: string }>) {
  const res = await fetch(`${BASE}/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update task');
  return res.json() as Promise<import('@/types').Task>;
}

export async function deleteTask(id: string) {
  const res = await fetch(`${BASE}/api/tasks/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete task');
}
