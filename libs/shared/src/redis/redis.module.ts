import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisService } from './redis.service';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('RedisModule');
        const host = configService.get<string>('REDIS_HOST', '127.0.0.1');
        const port = configService.get<number>('REDIS_PORT', 6379);
        const password = configService.get<string>('REDIS_PASSWORD');

        const client = new Redis({
          host,
          port,
          password,
          retryStrategy(times: number) {
            const delay = Math.min(times * 500, 5000);
            logger.warn(`Redis reconnecting... attempt ${times}, delay ${delay}ms`);
            if (times > 10) {
              logger.error('Redis max retries reached. Giving up.');
              return null;
            }
            return delay;
          },
          enableReadyCheck: true,
          maxRetriesPerRequest: 3,
          connectTimeout: 5000,
          commandTimeout: 3000,
        });

        client.on('error', (err) => logger.error('Redis error', err));
        client.on('connect', () => logger.log('Redis connected'));
        client.on('ready', () => logger.log('Redis ready'));
        client.on('close', () => logger.log('Redis connection closed'));

        return client;
      },
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
