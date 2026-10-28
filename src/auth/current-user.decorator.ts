import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  handle: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | null => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    return req.user ?? null;
  },
);
