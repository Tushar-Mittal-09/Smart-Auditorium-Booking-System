import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LoginAttemptDocument = LoginAttempt & Document;

@Schema()
export class LoginAttempt {
  @Prop({ required: true, index: true })
  email: string;

  @Prop({ required: true, index: true })
  ip: string;

  @Prop({ required: true })
  success: boolean;

  @Prop({ default: null })
  failureReason: string | null;

  @Prop({ required: true })
  userAgent: string;

  @Prop({ default: Date.now, index: { expires: '24h' } })
  attemptedAt: Date;
}

export const LoginAttemptSchema = SchemaFactory.createForClass(LoginAttempt);

LoginAttemptSchema.index({ ip: 1, attemptedAt: 1 });
LoginAttemptSchema.index({ email: 1, success: 1, attemptedAt: 1 });
