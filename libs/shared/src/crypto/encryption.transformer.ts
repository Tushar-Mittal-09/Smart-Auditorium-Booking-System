import * as crypto from 'crypto';
import { ValueTransformer } from 'typeorm';

export class EncryptionTransformer implements ValueTransformer {
  private readonly algorithm = 'aes-256-gcm';
  
  private getKey(): Buffer {
    const rawKey = process.env.ENCRYPTION_KEY;
    if (!rawKey || rawKey.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be exactly 64 characters (32 bytes hex)');
    }
    return Buffer.from(rawKey, 'hex');
  }

  to(value: string | null): string | null {
    if (!value) return value;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.getKey(), iv);
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  from(value: string | null): string | null {
    if (!value) return value;
    const parts = value.split(':');
    if (parts.length !== 3) return value;
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const ciphertext = parts[2];
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.getKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
