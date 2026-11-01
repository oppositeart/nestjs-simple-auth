import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type User } from '../../generated/prisma/client.js';
import { type Request } from 'express';

type AuthUser = Omit<User, 'password'>;

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest() as Request;

    const user = request.user as AuthUser | undefined;

    return data && user ? user[data] : user;
  },
);
