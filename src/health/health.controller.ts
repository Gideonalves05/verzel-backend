import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  @Public()
  @Get()
  @ApiOkResponse({
    description: 'Liveness probe',
    schema: {
      example: { status: 'ok', uptime_seconds: 42, version: '0.0.1' },
    },
  })
  health() {
    return {
      status: 'ok',
      uptime_seconds: Math.floor((Date.now() - this.startedAt) / 1000),
      version: process.env.npm_package_version ?? '0.0.1',
    };
  }
}
