import { Module } from '@nestjs/common';
import { BiddingController } from './bidding.controller';
import { BiddingService } from './bidding.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [BiddingController],
  providers: [BiddingService],
  exports: [BiddingService],
})
export class BiddingModule {}
