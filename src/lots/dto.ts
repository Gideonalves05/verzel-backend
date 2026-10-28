import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { LotStatus } from '@prisma/client';

export class CreateLotDto {
  @ApiProperty({ example: 'met' })
  @IsString()
  provider!: string;

  @ApiProperty({ example: '436535' })
  @IsString()
  external_id!: string;

  @ApiProperty({ required: false, example: 'Van Gogh — Wheat Field' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ example: '2026-10-28T14:00:00.000Z' })
  @IsDateString()
  starts_at!: string;

  @ApiProperty({ example: '2026-10-28T15:00:00.000Z' })
  @IsDateString()
  ends_at!: string;

  @ApiProperty({ example: '10000' })
  @IsNumberString()
  @Matches(/^[1-9][0-9]*$/)
  starting_bid_cents!: string;

  @ApiProperty({ example: '500' })
  @IsNumberString()
  @Matches(/^[1-9][0-9]*$/)
  min_increment_cents!: string;
}

export class ListLotsQueryDto {
  @ApiProperty({ required: false, enum: LotStatus })
  @IsOptional()
  @IsEnum(LotStatus)
  status?: LotStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  q?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 20;
}
