import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WinsController } from './settlement.controller';
import { SettlementService } from './settlement.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [ScheduleModule.forRoot(), RealtimeModule],
  controllers: [WinsController],
  providers: [SettlementService],
  exports: [SettlementService],
})
export class SettlementModule {}
