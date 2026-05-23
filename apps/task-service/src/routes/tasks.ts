import { Router, Response } from 'express';
import { Task, TaskStatus } from '../models/Task';
import { requireUser, AuthRequest } from '../middleware/auth';
import { getQueue } from '../queue/taskQueue';

const router = Router();
router.use(requireUser);

// ── List tasks ────────────────────────────────────────────────────────────────
router.get('/', async (req, res: Response) => {
  const { userId } = req as AuthRequest;
  const { status, priority, tag } = req.query;

  const filter: Record<string, unknown> = { userId };
  if (status)   filter.status   = status;
  if (priority) filter.priority = priority;
  if (tag)      filter.tags     = tag;

  const tasks = await Task.find(filter).sort({ createdAt: -1 });
  res.json({ tasks, total: tasks.length });
});

// ── Get single task ───────────────────────────────────────────────────────────
router.get('/:id', async (req, res: Response) => {
  const { userId } = req as unknown as AuthRequest;
  const task = await Task.findOne({ _id: req.params.id, userId });
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

// ── Create task ───────────────────────────────────────────────────────────────
router.post('/', async (req, res: Response) => {
  const { userId } = req as AuthRequest;
  const { title, description, priority, dueDate, tags } = req.body as {
    title?: string; description?: string; priority?: string; dueDate?: string; tags?: string[];
  };

  if (!title?.trim()) {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  const task = await Task.create({
    title: title.trim(),
    description: description ?? '',
    priority: priority ?? 'MEDIUM',
    userId,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    tags: tags ?? [],
  });

  res.status(201).json(task);
});

// ── Update task ───────────────────────────────────────────────────────────────
router.patch('/:id', async (req, res: Response) => {
  const { userId } = req as unknown as AuthRequest;
  const task = await Task.findOne({ _id: req.params.id, userId });
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const previousStatus = task.status;
  const { title, description, status, priority, dueDate, tags } = req.body as {
    title?: string; description?: string; status?: TaskStatus;
    priority?: string; dueDate?: string | null; tags?: string[];
  };

  if (title !== undefined)       task.title       = title.trim();
  if (description !== undefined) task.description = description;
  if (status !== undefined)      task.status      = status;
  if (priority !== undefined)    task.priority    = priority as never;
  if (dueDate !== undefined)     task.dueDate     = dueDate ? new Date(dueDate) : undefined;
  if (tags !== undefined)        task.tags        = tags;

  await task.save();

  // Enqueue async notification if status changed
  if (status && status !== previousStatus) {
    const q = getQueue();
    if (q) {
      await q.add('status-changed', {
        type: 'STATUS_CHANGED',
        taskId: task.id as string,
        taskTitle: task.title,
        userId,
        payload: { from: previousStatus, to: status },
      });
    }
  }

  res.json(task);
});

// ── Delete task ───────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res: Response) => {
  const { userId } = req as unknown as AuthRequest;
  const task = await Task.findOneAndDelete({ _id: req.params.id, userId });
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.status(204).send();
});

export default router;
