import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

/**
 * BullMQ job queue for async task processing.
 *
 * Interview talking points:
 *
 * 1. WHY a queue? — status-change notifications and due-date reminders shouldn't
 *    block the HTTP response. Enqueue the job and return 200 immediately; the worker
 *    processes it asynchronously. If the email provider is down, jobs stay in Redis
 *    and are retried — the API stays fast.
 *
 * 2. WHY Redis? — BullMQ uses Redis as its persistence layer. Jobs survive process
 *    restarts. Redis pub/sub drives the event model for real-time job state updates.
 *
 * 3. WORKER in same process vs separate process — for simplicity the worker runs in
 *    the same process here. In production you'd deploy separate worker pods that
 *    scale independently from the API pods (shown in the K8s HPA config).
 */

export type NotifyJobData = {
  type: 'STATUS_CHANGED' | 'DUE_SOON';
  taskId: string;
  taskTitle: string;
  userId: string;
  payload: Record<string, unknown>;
};

let queue: Queue<NotifyJobData> | null = null;
let worker: Worker<NotifyJobData> | null = null;

export function getQueue(): Queue<NotifyJobData> | null {
  return queue;
}

export function initQueue(redisUrl: string) {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  // defaultJobOptions lives on the Queue, not the Worker
  queue = new Queue<NotifyJobData>('task-notifications', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });

  worker = new Worker<NotifyJobData>(
    'task-notifications',
    async (job: Job<NotifyJobData>) => {
      // In production this would call an email/push notification service.
      // For the demo we log the job — the important thing is the pattern.
      console.log(`[worker] processing job ${job.id} type=${job.data.type}`);
      console.log(`[worker]   task="${job.data.taskTitle}" user=${job.data.userId}`);

      if (job.data.type === 'STATUS_CHANGED') {
        const { from, to } = job.data.payload as { from: string; to: string };
        console.log(`[worker]   status changed: ${from} → ${to}`);
        // await emailService.send({ to: user.email, subject: '...' })
      }

      if (job.data.type === 'DUE_SOON') {
        console.log(`[worker]   task due soon: ${job.data.taskTitle}`);
      }
    },
    { connection, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });

  console.log('[task-service] BullMQ queue + worker initialised');
  return queue;
}

export async function closeQueue() {
  await worker?.close();
  await queue?.close();
}
