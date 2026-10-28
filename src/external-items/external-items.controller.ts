import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { ExternalItemsService } from './external-items.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

class SearchQueryDto {
  @IsString()
  @MinLength(1)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;
}

@ApiTags('external-items')
@ApiBearerAuth()
@Controller('external-items')
@UseGuards(RolesGuard)
export class ExternalItemsController {
  constructor(private readonly items: ExternalItemsService) {}

  @Get('search')
  @Roles(UserRole.auctioneer)
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiOkResponse({ description: 'Paginated external item search results' })
  search(@Query() query: SearchQueryDto) {
    return this.items.search(query.q, query.page);
  }
}
