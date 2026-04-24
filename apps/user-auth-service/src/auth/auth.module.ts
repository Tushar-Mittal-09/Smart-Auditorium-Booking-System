import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AppConfigModule, PostgresModule, MongoModule, RedisModule } from '@sabs/shared';

@Module({
  imports: [
    AppConfigModule,
    PostgresModule,
    MongoModule,
    RedisModule
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
