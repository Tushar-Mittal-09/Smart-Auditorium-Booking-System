import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../redis/redis.service';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  
  // Default: 100 requests per minute per IP
  private readonly DEFAULT_LIMIT = 100;
  private readonly DEFAULT_WINDOW = 60;

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    
    // Check if route has custom rate limit
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const limit = options?.limit ?? this.DEFAULT_LIMIT;
    const windowSeconds = options?.windowSeconds ?? this.DEFAULT_WINDOW;

    // Use route path to isolate limits, fallback to generic if undefined
    const route = request.route?.path || request.url || 'unknown';
    
    const key = `rate-limit:${ip}:${route}`;
    
    // Increment requests counter
    const currentRequests = await this.redisService.increment(key);
    
    if (currentRequests === 1) {
      // Set expiration on first request
      await this.redisService.expire(key, windowSeconds);
    }

    if (currentRequests > limit) {
      this.logger.warn(`Rate limit exceeded for IP: ${ip} on route: ${route}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          retryAfter: windowSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
