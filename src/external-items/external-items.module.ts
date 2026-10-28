import { Module } from '@nestjs/common';
import { ExternalItemsController } from './external-items.controller';
import { ExternalItemsService } from './external-items.service';
import { MetClient } from './met.client';

@Module({
  controllers: [ExternalItemsController],
  providers: [ExternalItemsService, MetClient],
  exports: [ExternalItemsService],
})
export class ExternalItemsModule {}
