import mongoose, { Schema, Document } from 'mongoose';

/**
 * MongoDB document model for users.
 *
 * Interview talking point: unlike relational tables, MongoDB documents can embed
 * sub-documents. Here we store nothing beyond basics — but in a richer model you
 * might embed { preferences: {...} } rather than creating a separate table/join.
 */
export interface IUser extends Document {
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    name:         { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

// Index already created by `unique: true` on email, but explicit for clarity
UserSchema.index({ email: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);
