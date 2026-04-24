import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export type SessionDocument = Session & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Session {
  @Prop({ default: uuidv4, unique: true, index: true })
  sessionId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  tokenVersion: number;

  @Prop({ required: true })
  refreshTokenHash: string;

  @Prop({ required: true })
  refreshTokenFamily: string;

  @Prop({
    type: {
      userAgent: { type: String, required: true },
      userAgentHash: { type: String, required: true },
      ip: { type: String, required: true },
      device: { type: String, required: false },
      location: { type: String, required: false },
    },
    required: true,
  })
  deviceInfo: {
    userAgent: string;
    userAgentHash: string;
    ip: string;
    device?: string;
    location?: string;
  };

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: null })
  revokedAt: Date | null;

  @Prop({ default: null })
  revokedReason: string | null;

  @Prop({ default: Date.now })
  lastUsedAt: Date;

  @Prop({ type: Date, required: true, index: { expires: 0 } })
  expiresAt: Date;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

SessionSchema.index({ userId: 1, isActive: 1, createdAt: -1 });

SessionSchema.index(
  { userId: 1 },
  { partialFilterExpression: { isActive: true, revokedAt: null } }
);

SessionSchema.index({ refreshTokenFamily: 1, isActive: 1 });
