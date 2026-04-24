import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { User, Role } from '../entities';
import { AuditLogDocument, AuditLog } from '../schemas/audit-log.schema';
import { RedisService } from '@sabs/shared';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    private readonly redisService: RedisService,
  ) {}

  async register(dto: RegisterDto, ip: string, userAgent: string, correlationId: string) {
    this.logger.log('Register method hit');
    
    // Validate domain handled in DTO validator, but service could verify too if needed

    const existingUser = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const password_hash = await argon2.hash(dto.password);
    
    const studentRole = await this.roleRepository.findOne({ where: { name: 'STUDENT' } });
    
    const user = this.userRepository.create({
      email: dto.email,
      password_hash,
      first_name: dto.firstName,
      last_name: dto.lastName,
      roles: studentRole ? [studentRole] : [],
    });

    await this.userRepository.save(user);

    const emailToken = uuidv4();
    await this.redisService.setWithExpiry(`email_verify:${emailToken}`, user.id, 86400);

    try {
      await this.auditLogModel.create({
        userId: user.id,
        action: 'REGISTRATION',
        metadata: { email: user.email },
        ip,
        userAgent,
        correlationId,
      });
    } catch (e) {
      this.logger.error('Failed to write audit log', e);
    }

    const { password_hash: _, mfa_secret, mfa_backup_codes, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  async login() {
    this.logger.log('Login method hit');
    return { message: 'Not implemented' };
  }

  async refreshToken() {
    this.logger.log('Refresh token method hit');
    return { message: 'Not implemented' };
  }

  async logout() {
    this.logger.log('Logout method hit');
    return { message: 'Not implemented' };
  }
}
