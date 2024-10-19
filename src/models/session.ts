// src/models/Session.ts
import { Schema, model } from 'mongoose';

interface ISession {
    sessionId: string;
    session: Record<string, any>;
}

const sessionSchema = new Schema<ISession>({
    sessionId: { type: String, required: true },
    session: { type: Object, required: true },
});

export const Session = model<ISession>('Session', sessionSchema);
