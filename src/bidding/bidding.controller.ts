import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString, Matches } from 'class-validator';
import { UserRole } from '@prisma/client';
import { BiddingService } from './bidding.service';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { PaginationQueryDto } from '../common/pagination';

class PlaceBidDto {
  @ApiProperty({ example: '15000', description: 'Amount in cents' })
  @IsNumberString()
  @Matches(/^[1-9][0-9]*$/)
  amount_cents!: string;
}

@ApiTags('bidding')
@Controller('lots')
@UseGuards(RolesGuard)
export class BiddingController {
  constructor(private readonly bidding: BiddingService) {}

  @ApiBearerAuth()
  @Post(':id/bids')
  @Roles(UserRole.bidder)
  @HttpCode(HttpStatus.CREATED)
  place(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PlaceBidDto,
  ) {
    return this.bidding.placeBid(user.id, id, BigInt(dto.amount_cents));
  }

  @Public()
  @Get(':id/bids')
  @ApiOkResponse({ description: 'Paginated bid history, anonymized handles' })
  list(@Param('id') id: string, @Query() q: PaginationQueryDto) {
    return this.bidding.listBids(id, q.page, q.pageSize);
  }
}
