import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (err: any) {
      this.logger.error(`Error getting key ${key}: ${err.message}`, err.stack);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (err: any) {
      this.logger.error(`Error setting key ${key}: ${err.message}`, err.stack);
    }
  }

  async setWithExpiry(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.set(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err: any) {
      this.logger.error(`Error deleting key ${key}: ${err.message}`, err.stack);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (err: any) {
      this.logger.error(`Error checking existence of key ${key}: ${err.message}`, err.stack);
      return false;
    }
  }

  async increment(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (err: any) {
      this.logger.error(`Error incrementing key ${key}: ${err.message}`, err.stack);
      throw err;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.expire(key, ttlSeconds);
    } catch (err: any) {
      this.logger.error(`Error expiring key ${key}: ${err.message}`, err.stack);
    }
  }

  async ping(): Promise<boolean> {
    try {
      // @ts-ignore
      const result = await Promise.race([
        this.client.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis ping timeout')), 2000)),
      ]);
      return result === 'PONG';
    } catch (err: any) {
      this.logger.error(`Redis ping failed: ${err.message}`);
      return false;
    }
  }
}
