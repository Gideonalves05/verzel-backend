import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { Public } from '../auth/public.decorator';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Public()
  @Get('lots/:id')
  @ApiOkResponse({ description: 'Full ordered bid history with integrity check' })
  getLot(@Param('id') id: string) {
    return this.audit.getLot(id);
  }

  @Public()
  @Get('receipts/:token')
  @ApiOkResponse({ description: 'Public receipt payload' })
  getReceipt(@Param('token') token: string) {
    return this.audit.getReceiptByToken(token);
  }
}
