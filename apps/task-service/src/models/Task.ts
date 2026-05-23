import mongoose, { Schema, Document } from 'mongoose';

export type TaskStatus   = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * MongoDB Task document.
 *
 * Interview talking point: userId is stored as a plain string (denormalised),
 * not as a MongoDB ObjectId reference to a users collection. In microservices,
 * each service owns its own database — there is no shared DB to reference across
 * services. The user's identity comes from the JWT and is trusted at the gateway.
 * This is the key difference from a monolith where you'd have a foreign key.
 */
export interface ITask extends Document {
  title:       string;
  description: string;
  status:      TaskStatus;
  priority:    TaskPriority;
  userId:      string;      // from JWT — no cross-service DB reference
  dueDate?:    Date;
  tags:        string[];
  createdAt:   Date;
  updatedAt:   Date;
}

const TaskSchema = new Schema<ITask>(
  {
    title:       { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 2000 },
    status:      { type: String, enum: ['TODO', 'IN_PROGRESS', 'DONE'], default: 'TODO' },
    priority:    { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
    userId:      { type: String, required: true, index: true },
    dueDate:     { type: Date },
    tags:        [{ type: String, trim: true }],
  },
  { timestamps: true },
);

// Compound index: list tasks for a user sorted by creation
TaskSchema.index({ userId: 1, createdAt: -1 });

export const Task = mongoose.model<ITask>('Task', TaskSchema);
