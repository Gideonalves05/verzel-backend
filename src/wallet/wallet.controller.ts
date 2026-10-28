import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IsNumberString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';

class DepositDto {
  @ApiProperty({ example: '500000', description: 'Amount in cents' })
  @IsNumberString()
  @Matches(/^[1-9][0-9]*$/, { message: 'amount_cents must be a positive integer' })
  amount_cents!: string;
}

@ApiTags('wallet')
@ApiBearerAuth()
@Controller('me/wallet')
@UseGuards(RolesGuard)
@Roles(UserRole.bidder)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  @ApiOkResponse({
    schema: {
      example: {
        total_cents: '1000000',
        committed_cents: '0',
        available_cents: '1000000',
      },
    },
  })
  get(@CurrentUser() user: AuthUser) {
    return this.wallet.getForUser(user.id);
  }

  @Post('deposits')
  @HttpCode(HttpStatus.CREATED)
  @ApiOkResponse({ description: 'Updated wallet snapshot' })
  deposit(@CurrentUser() user: AuthUser, @Body() dto: DepositDto) {
    return this.wallet.deposit(user.id, BigInt(dto.amount_cents));
  }
}
