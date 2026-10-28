import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ExternalItemsModule } from './external-items/external-items.module';
import { WalletModule } from './wallet/wallet.module';
import { LotsModule } from './lots/lots.module';
import { BiddingModule } from './bidding/bidding.module';
import { AuditModule } from './audit/audit.module';
import { SettlementModule } from './settlement/settlement.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthController } from './health/health.controller';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'verzel-backend',
    }),
    PrismaModule,
    AuthModule,
    ExternalItemsModule,
    WalletModule,
    LotsModule,
    RealtimeModule,
    BiddingModule,
    AuditModule,
    SettlementModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
