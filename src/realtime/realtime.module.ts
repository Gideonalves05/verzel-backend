import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LiveEventsService } from './live-events.service';
import { LiveLotsGateway } from './live-lots.gateway';

@Module({
  imports: [AuthModule],
  providers: [LiveEventsService, LiveLotsGateway],
  exports: [LiveEventsService],
})
export class RealtimeModule {}
