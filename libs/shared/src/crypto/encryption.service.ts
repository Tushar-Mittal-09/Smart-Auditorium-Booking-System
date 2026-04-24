import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;
  private readonly logger = new Logger(EncryptionService.name);

  constructor(private configService: ConfigService) {
    const rawKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!rawKey || rawKey.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be exactly 64 characters (32 bytes hex)');
    }
    this.key = Buffer.from(rawKey, 'hex');
  }

  encrypt(text: string): string {
    if (!text) return text;
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');
      return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (err) {
      this.logger.error('Encryption failed', err);
      throw err;
    }
  }

  decrypt(encryptedText: string): string {
    if (!encryptedText) return encryptedText;
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) throw new Error('Invalid encrypted text format');
      
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const ciphertext = parts[2];
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (err) {
      this.logger.error('Decryption failed', err);
      throw err;
    }
  }
}
