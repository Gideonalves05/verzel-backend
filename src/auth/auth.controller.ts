import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, LoginResponseDto, RegisterDto, UserDto } from './dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './current-user.decorator';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('auth/register')
  @ApiCreatedResponse({ schema: { example: { user: { id: '…', email: '…', role: 'bidder', handle: 'bidder-7fa3' } } } })
  async register(@Body() dto: RegisterDto): Promise<{ user: UserDto }> {
    const user = await this.auth.register(dto);
    return { user };
  }

  @Public()
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LoginResponseDto })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.auth.login(dto);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() user: AuthUser): UserDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      handle: user.handle,
    };
  }
}
