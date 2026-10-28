import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'alice@verzel.test' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'verzel123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.bidder })
  @IsEnum(UserRole)
  role!: UserRole;
}

export class LoginDto {
  @ApiProperty({ example: 'alice@verzel.test' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'verzel123' })
  @IsString()
  password!: string;
}

export class UserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: UserRole }) role!: UserRole;
  @ApiProperty() handle!: string;
}

export class LoginResponseDto {
  @ApiProperty() access_token!: string;
  @ApiProperty({ example: 'Bearer' }) token_type!: string;
  @ApiProperty({ example: 86400 }) expires_in!: number;
  @ApiProperty({ type: UserDto }) user!: UserDto;
}
