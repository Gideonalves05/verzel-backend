import { Module } from '@nestjs/common';
import { LotsController } from './lots.controller';
import { LotsService } from './lots.service';
import { ExternalItemsModule } from '../external-items/external-items.module';

@Module({
  imports: [ExternalItemsModule],
  controllers: [LotsController],
  providers: [LotsService],
  exports: [LotsService],
})
export class LotsModule {}
