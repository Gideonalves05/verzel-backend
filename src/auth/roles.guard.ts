import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import { DomainError } from '../common/filters/http-exception.filter';
import type { AuthUser } from './current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) {
      throw new DomainError('unauthorized', 'Authentication required', 401);
    }
    if (!required.includes(user.role)) {
      const message =
        user.role === 'auctioneer'
          ? this.auctioneerDenied(required)
          : this.bidderDenied(required);
      throw new DomainError('role_forbidden', message, 403);
    }
    return true;
  }

  private auctioneerDenied(required: UserRole[]): string {
    if (required.includes('bidder')) return 'Auctioneers cannot place bids';
    return 'This action is not allowed for your role';
  }

  private bidderDenied(required: UserRole[]): string {
    if (required.includes('auctioneer')) return 'Only auctioneers can create lots';
    return 'This action is not allowed for your role';
  }
}
