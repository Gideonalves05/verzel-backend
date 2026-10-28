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
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { LotsService } from './lots.service';
import { CreateLotDto, ListLotsQueryDto } from './dto';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';

@ApiTags('lots')
@Controller()
@UseGuards(RolesGuard)
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  @Public()
  @Get('lots')
  @ApiOkResponse({ description: 'Paginated showcase of lots' })
  list(@Query() query: ListLotsQueryDto) {
    return this.lots.list(query);
  }

  @Public()
  @Get('lots/:id')
  @ApiOkResponse({ description: 'Lot details' })
  get(@Param('id') id: string) {
    return this.lots.get(id);
  }

  @ApiBearerAuth()
  @Post('lots')
  @Roles(UserRole.auctioneer)
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLotDto) {
    return this.lots.create(user.id, dto);
  }

  @ApiBearerAuth()
  @Post('lots/:id/cancel')
  @Roles(UserRole.auctioneer)
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lots.cancel(user.id, id);
  }

  @ApiBearerAuth()
  @Get('me/lots')
  @Roles(UserRole.auctioneer)
  listMine(@CurrentUser() user: AuthUser) {
    return this.lots.listMine(user.id);
  }

  @ApiBearerAuth()
  @Get('me/revenue')
  @Roles(UserRole.auctioneer)
  revenue(@CurrentUser() user: AuthUser) {
    return this.lots.revenue(user.id);
  }
}
