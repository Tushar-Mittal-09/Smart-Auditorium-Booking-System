import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { IAuthUser } from '../interfaces/auth-user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: IAuthUser = request.user;

    if (!user) {
      this.logger.error(
        'PermissionsGuard: request.user is undefined. ' +
        'JwtAuthGuard must run BEFORE PermissionsGuard. ' +
        'Check guard registration order or remove @Public() from this route.'
      );
      throw new ForbiddenException('Authorization configuration error');
    }

    const hasAllPermissions = requiredPermissions.every((perm) => user.permissions.includes(perm));
    if (!hasAllPermissions) {
      throw new ForbiddenException(
        `Access denied. Missing required permissions.`
      );
    }

    return true;
  }
}
