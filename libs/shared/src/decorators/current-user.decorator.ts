import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { IAuthUser } from '../interfaces/auth-user.interface';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): IAuthUser => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) {
      throw new InternalServerErrorException(
        'User not found on request. Make sure JwtAuthGuard is applied.'
      );
    }
    
    return user as IAuthUser;
  },
);
