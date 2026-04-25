import { SetMetadata, applyDecorators } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

export const RateLimit = (limit: number, windowSeconds: number) => 
  SetMetadata(RATE_LIMIT_KEY, { limit, windowSeconds });

export const LoginRateLimit = () => RateLimit(5, 900); // 5 attempts per 15 mins
export const StrictRateLimit = () => RateLimit(10, 60); // 10 requests per minute
