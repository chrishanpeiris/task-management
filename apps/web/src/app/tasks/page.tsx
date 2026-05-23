'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchTasks, createTask, updateTask, deleteTask } from '@/lib/api';
import type { Task, TaskStatus, TaskPriority } from '@/types';

const STATUS_COLOURS: Record<TaskStatus, string> = {
  TODO:        'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE:        'bg-green-100 text-green-700',
};
const PRIORITY_COLOURS: Record<TaskPriority, string> = {
  LOW:    'bg-gray-100 text-gray-500',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH:   'bg-red-100 text-red-700',
};

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('MEDIUM');
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchTasks(statusFilter ? { status: statusFilter } : {});
      setTasks(data.tasks);
    } catch {
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, router]);

  useEffect(() => {
    if (!localStorage.getItem('auth_token')) { router.replace('/login'); return; }
    load();
  }, [load, router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const task = await createTask({ title: newTitle.trim(), priority: newPriority });
      setTasks((prev) => [task, ...prev]);
      setNewTitle('');
    } finally { setCreating(false); }
  }

  async function handleStatusChange(task: Task, status: TaskStatus) {
    const updated = await updateTask(task._id, { status });
    setTasks((prev) => prev.map((t) => (t._id === task._id ? updated : t)));
  }

  async function handleDelete(id: string) {
    await deleteTask(id);
    setTasks((prev) => prev.filter((t) => t._id !== id));
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">My Tasks</h1>
        <button onClick={() => { localStorage.removeItem('auth_token'); router.push('/login'); }}
          className="text-sm text-gray-500 hover:text-gray-700">Sign out</button>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Create form */}
        <form onSubmit={handleCreate} className="flex gap-2">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New task title…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm">
            {(['LOW', 'MEDIUM', 'HIGH'] as TaskPriority[]).map((p) => <option key={p}>{p}</option>)}
          </select>
          <button type="submit" disabled={creating}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            Add
          </button>
        </form>

        {/* Filters */}
        <div className="flex gap-2">
          {(['', 'TODO', 'IN_PROGRESS', 'DONE'] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>

        {/* Task list */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map((i) => <div key={i} className="h-16 bg-white border border-gray-200 rounded-lg animate-pulse" />)}
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No tasks yet. Add one above.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task._id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm ${task.status === 'DONE' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
                  <div className="flex gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLOURS[task.status]}`}>{task.status}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLOURS[task.priority]}`}>{task.priority}</span>
                  </div>
                </div>
                <select value={task.status} onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                  className="text-xs border border-gray-300 rounded px-1.5 py-1">
                  {(['TODO', 'IN_PROGRESS', 'DONE'] as TaskStatus[]).map((s) => <option key={s}>{s}</option>)}
                </select>
                <button onClick={() => handleDelete(task._id)} className="text-gray-400 hover:text-red-500 text-sm">✕</button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
