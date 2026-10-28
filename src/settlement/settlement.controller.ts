import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SettlementService } from './settlement.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';

@ApiTags('wins')
@ApiBearerAuth()
@Controller('me/wins')
@UseGuards(RolesGuard)
@Roles(UserRole.bidder)
export class WinsController {
  constructor(private readonly settlement: SettlementService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.settlement.listMyWins(user.id);
  }
}
