import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LotStatus, Prisma, WalletLedgerKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/filters/http-exception.filter';
import { deriveLotHandle } from '../common/anon-handle';
import { sealHmac } from '../audit/hash-chain';
import { LiveEventsService } from '../realtime/live-events.service';

@Injectable()
export class SettlementService implements OnModuleInit {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: LiveEventsService,
  ) {}

  onModuleInit() {
    // nothing — @Cron registers itself
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick() {
    const now = new Date();
    // Find lots live-and-past-end that are not already settled
    const candidates = await this.prisma.lot.findMany({
      where: {
        status: { in: [LotStatus.live, LotStatus.scheduled] },
        endsAt: { lte: now },
      },
      select: { id: true },
      take: 10,
    });
    for (const { id } of candidates) {
      try {
        await this.settleLot(id);
      } catch (err) {
        this.logger.warn(
          `Failed to settle lot ${id}: ${(err as Error).message}`,
        );
      }
    }
  }

  async settleLot(lotId: string) {
    const signingKey = process.env.AUDIT_SIGNING_KEY ?? 'dev-key';

    const settlementResult = await this.prisma.$transaction(
      async (tx) => {
        // Idempotent claim: only settle if still live/scheduled and endsAt in the past
        const claimed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          UPDATE "Lot"
          SET status = 'ended', "settledAt" = NOW()
          WHERE id = ${lotId}
            AND status IN ('live','scheduled')
            AND "endsAt" <= NOW()
          RETURNING id
        `);
        if (claimed.length === 0) return null;

        const lot = await tx.lot.findUnique({
          where: { id: lotId },
        });
        if (!lot) return null;

        let winnerUserId: string | null = null;
        let amountCents = 0n;
        let receiptToken: string | null = null;

        if (lot.currentLeaderUserId && lot.currentBidAmountCents) {
          winnerUserId = lot.currentLeaderUserId;
          amountCents = lot.currentBidAmountCents;

          // Debit winner
          await tx.wallet.update({
            where: { userId: winnerUserId },
            data: {
              balanceTotalCents: { decrement: amountCents },
              balanceCommittedCents: { decrement: amountCents },
            },
          });
          // Credit auctioneer: create wallet if missing (auctioneers normally have no wallet)
          await tx.wallet.upsert({
            where: { userId: lot.auctioneerId },
            update: {
              balanceTotalCents: { increment: amountCents },
            },
            create: {
              userId: lot.auctioneerId,
              balanceTotalCents: amountCents,
            },
          });
          await tx.walletLedgerEntry.createMany({
            data: [
              {
                userId: winnerUserId,
                kind: WalletLedgerKind.debit,
                amountCents,
                lotId,
              },
              {
                userId: lot.auctioneerId,
                kind: WalletLedgerKind.credit,
                amountCents,
                lotId,
              },
            ],
          });
        }

        const settlement = await tx.settlement.create({
          data: {
            lotId,
            winnerUserId,
            auctioneerUserId: lot.auctioneerId,
            amountCents,
          },
        });

        if (winnerUserId) {
          const receipt = await tx.receipt.create({
            data: { settlementId: settlement.id },
          });
          receiptToken = receipt.shareToken;
        }

        // Final seal (always, even without a winner)
        const latestBid = await tx.bid.findFirst({
          where: { lotId },
          orderBy: { seq: 'desc' },
        });
        if (latestBid) {
          const createdAtIso = new Date().toISOString();
          await tx.auditSeal.create({
            data: {
              lotId,
              seq: latestBid.seq,
              chainHeadHash: latestBid.currHash,
              createdAt: new Date(createdAtIso),
              hmac: sealHmac(signingKey, {
                lotId,
                seq: latestBid.seq,
                chainHeadHash: latestBid.currHash,
                createdAtIso,
              }),
              final: true,
            },
          });
        }

        return {
          winnerUserId,
          amountCents,
          receiptToken,
          settlement,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!settlementResult) return;

    const winnerHandle = settlementResult.winnerUserId
      ? deriveLotHandle(signingKey, settlementResult.winnerUserId, lotId)
      : null;

    this.events.emitLotEnded({
      lot_id: lotId,
      winner_handle: winnerHandle,
      winner_user_id: settlementResult.winnerUserId,
      final_amount_cents: settlementResult.winnerUserId
        ? settlementResult.amountCents.toString()
        : null,
      settled_at: settlementResult.settlement.settledAt.toISOString(),
      receipt_token: settlementResult.receiptToken,
    });
  }

  async listMyWins(bidderId: string) {
    const settlements = await this.prisma.settlement.findMany({
      where: { winnerUserId: bidderId },
      include: {
        lot: { include: { externalItem: true } },
        receipt: true,
      },
      orderBy: { settledAt: 'desc' },
    });
    return settlements.map((s) => ({
      lot: {
        id: s.lot.id,
        title: s.lot.title,
        image_url: s.lot.externalItem.primaryImageUrl,
      },
      amount_cents: s.amountCents.toString(),
      settled_at: s.settledAt.toISOString(),
      receipt_token: s.receipt?.shareToken ?? null,
    }));
  }
}
