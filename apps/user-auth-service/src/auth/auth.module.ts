import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AppConfigModule, PostgresModule, MongoModule, RedisModule, EncryptionService } from '@sabs/shared';
import { User, Role, Permission } from '../entities';
import { Session, SessionSchema, LoginAttempt, LoginAttemptSchema, AuditLog, AuditLogSchema } from '../schemas';
import { SeedService } from '../database/seed.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    AppConfigModule,
    PostgresModule,
    MongoModule,
    RedisModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([User, Role, Permission]),
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: LoginAttempt.name, schema: LoginAttemptSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ])
  ],
  controllers: [AuthController],
  providers: [AuthService, EncryptionService, SeedService, TokenService],
})
export class AuthModule {}
