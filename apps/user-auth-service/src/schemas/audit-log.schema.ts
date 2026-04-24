import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema()
export class AuditLog {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  action: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: any;

  @Prop({ required: true })
  ip: string;

  @Prop({ required: true })
  userAgent: string;

  @Prop({ default: null })
  correlationId: string | null;

  @Prop({ default: Date.now, index: true })
  timestamp: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ userId: 1, action: 1, timestamp: -1 });
