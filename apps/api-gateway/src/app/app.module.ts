import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { 
  AppConfigModule, 
  RedisModule, 
  PostgresModule, 
  RateLimitGuard, 
  JwtAuthGuard,
  JwtStrategy
} from '@sabs/shared';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    AppConfigModule,
    RedisModule,
    PostgresModule, // needed by JwtStrategy to check tokenVersion
  ],
  controllers: [AppController],
  providers: [
    AppService,
    JwtStrategy,
    // ⚠️ ORDER IS EXECUTION ORDER — DO NOT REARRANGE
    //
    // 1st: Rate limiting — cheapest check, blocks abusive IPs
    //      before wasting CPU on JWT validation or DB queries
    { provide: APP_GUARD, useClass: RateLimitGuard },
    //
    // 2nd: JWT Authentication — validates token, checks blacklist,
    //      checks tokenVersion, populates request.user
    //      Skips if route has @Public() decorator
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    //
    // RolesGuard and PermissionsGuard are intentionally NOT here.
    // They are per-route via @UseGuards() or @Auth() decorator.
    // Making them global would require @Roles() on EVERY route.
  ],
})
export class AppModule {}
