import { applyDecorators, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../guards/roles.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { Roles, Role } from './roles.decorator';
import { Permissions } from './permissions.decorator';

export function Auth(...roles: Role[]) {
  return applyDecorators(
    UseGuards(RolesGuard),
    Roles(...roles),
  );
}

export function AuthWithPermissions(roles: Role[], permissions: string[]) {
  return applyDecorators(
    UseGuards(RolesGuard, PermissionsGuard),
    Roles(...roles),
    Permissions(...permissions),
  );
}
