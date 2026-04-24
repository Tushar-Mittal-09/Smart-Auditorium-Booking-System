import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, TypeOrmHealthIndicator, MongooseHealthIndicator, HealthCheck } from '@nestjs/terminus';
import { RedisService } from '@sabs/shared';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private mongoose: MongooseHealthIndicator,
    private redisService: RedisService,
  ) {}

  @Get()
  @HealthCheck()
  async check() {
    const isRedisPingSuccess = await this.redisService.ping();
    
    return this.health.check([
      () => this.db.pingCheck('postgres', { timeout: 1500 }),
      () => this.mongoose.pingCheck('mongodb', { timeout: 1500 }),
      () => ({
        redis: {
          status: isRedisPingSuccess ? 'up' : 'down',
        },
      }),
    ]);
  }
}
