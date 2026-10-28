import { Injectable } from '@nestjs/common';
import {
  Bid,
  LotStatus,
  Prisma,
  UserRole,
  WalletLedgerKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/filters/http-exception.filter';
import { deriveLotHandle } from '../common/anon-handle';
import {
  canonicalBidJson,
  chainNext,
  genesisHash,
  sealHmac,
} from '../audit/hash-chain';
import { LiveEventsService } from '../realtime/live-events.service';

const ANTI_SNIPING_WINDOW_MS = 2 * 60 * 1000;
const ANTI_SNIPING_EXTEND_MS = 2 * 60 * 1000;
const ANTI_SNIPING_CAP_MS = 60 * 60 * 1000;
const SEAL_EVERY = 10;

export type PlaceBidResult = {
  id: string;
  seq: number;
  lot_id: string;
  amount_cents: string;
  handle: string;
  placed_at: string;
  new_ends_at: string;
  extended: boolean;
};

@Injectable()
export class BiddingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: LiveEventsService,
  ) {}

  async placeBid(
    bidderId: string,
    lotId: string,
    amountCents: bigint,
  ): Promise<PlaceBidResult> {
    if (amountCents <= 0n) {
      throw new DomainError('validation_error', 'amount_cents must be positive', 400);
    }
    const signingKey = process.env.AUDIT_SIGNING_KEY ?? 'dev-key';

    const result = await this.prisma.$transaction(
      async (tx) => {
        const bidder = await tx.user.findUnique({ where: { id: bidderId } });
        if (!bidder || bidder.role !== UserRole.bidder) {
          throw new DomainError(
            'role_forbidden',
            'Only bidders can place bids',
            403,
          );
        }

        // SELECT ... FOR UPDATE on the lot row to serialize bids on the same lot.
        const locked = await tx.$queryRaw<
          Array<{ id: string }>
        >(Prisma.sql`SELECT id FROM "Lot" WHERE id = ${lotId} FOR UPDATE`);
        if (locked.length === 0) {
          throw new DomainError('not_found', 'Lot not found', 404);
        }

        const lot = await tx.lot.findUnique({ where: { id: lotId } });
        if (!lot) {
          throw new DomainError('not_found', 'Lot not found', 404);
        }

        const now = new Date();
        if (lot.status === LotStatus.cancelled) {
          throw new DomainError('lot_cancelled', 'Lot has been cancelled', 409);
        }
        if (lot.status === LotStatus.ended) {
          throw new DomainError('lot_ended', 'Lot has ended', 409);
        }
        if (now < lot.startsAt) {
          throw new DomainError(
            'lot_not_started',
            'Lot is not open for bids yet',
            409,
          );
        }
        if (now >= lot.endsAt) {
          throw new DomainError('lot_ended', 'Lot has ended', 409);
        }

        if (lot.bidCount === 0) {
          if (amountCents < lot.startingBidCents) {
            throw new DomainError(
              'below_starting_bid',
              'Bid must be at least the starting bid',
              409,
              { required_cents: lot.startingBidCents.toString() },
            );
          }
        } else {
          const required = (lot.currentBidAmountCents ?? 0n) + lot.minIncrementCents;
          if (amountCents < required) {
            throw new DomainError(
              'below_min_increment',
              'Bid must be at least current + minimum increment',
              409,
              { required_cents: required.toString() },
            );
          }
        }

        if (lot.currentLeaderUserId === bidderId) {
          throw new DomainError(
            'already_leading',
            'You are already the leading bidder',
            409,
          );
        }

        // wallet check (available = total - committed)
        const wallet = await tx.wallet.findUnique({ where: { userId: bidderId } });
        if (!wallet) {
          throw new DomainError(
            'role_forbidden',
            'Only bidders have wallets',
            403,
          );
        }
        const available =
          wallet.balanceTotalCents - wallet.balanceCommittedCents;
        if (amountCents > available) {
          throw new DomainError(
            'insufficient_available_balance',
            'Not enough available balance for this bid',
            409,
            { available_cents: available.toString() },
          );
        }

        // release previous leader's commit
        const previousLeaderId = lot.currentLeaderUserId;
        if (previousLeaderId && lot.currentBidAmountCents) {
          await tx.wallet.update({
            where: { userId: previousLeaderId },
            data: {
              balanceCommittedCents: { decrement: lot.currentBidAmountCents },
            },
          });
        }
        // commit new leader
        await tx.wallet.update({
          where: { userId: bidderId },
          data: {
            balanceCommittedCents: { increment: amountCents },
          },
        });

        const seq = lot.bidCount + 1;
        const handle = deriveLotHandle(signingKey, bidderId, lotId);
        const placedAt = new Date();
        const prevHash =
          seq === 1
            ? genesisHash(lotId)
            : (await tx.bid.findFirst({
                where: { lotId },
                orderBy: { seq: 'desc' },
              }))!.currHash;
        const canonical = canonicalBidJson({
          lotId,
          seq,
          handle,
          amountCents,
          placedAtIso: placedAt.toISOString(),
        });
        const currHash = chainNext(prevHash, canonical);

        const bid = await tx.bid.create({
          data: {
            lotId,
            bidderId,
            seq,
            amountCents,
            handle,
            placedAt,
            prevHash,
            currHash,
          },
        });

        // anti-sniping extension
        let newEndsAt = lot.endsAt;
        let extended = false;
        const timeLeftMs = lot.endsAt.getTime() - now.getTime();
        const capMs =
          lot.originalEndsAt.getTime() + ANTI_SNIPING_CAP_MS;
        const canExtend = lot.endsAt.getTime() < capMs;
        if (timeLeftMs <= ANTI_SNIPING_WINDOW_MS && canExtend) {
          newEndsAt = new Date(
            Math.min(
              lot.endsAt.getTime() + ANTI_SNIPING_EXTEND_MS,
              capMs,
            ),
          );
          extended = newEndsAt.getTime() !== lot.endsAt.getTime();
        }

        await tx.lot.update({
          where: { id: lotId },
          data: {
            currentBidAmountCents: amountCents,
            currentLeaderUserId: bidderId,
            bidCount: { increment: 1 },
            endsAt: newEndsAt,
            status: LotStatus.live,
          },
        });

        // ledger
        if (previousLeaderId && lot.currentBidAmountCents) {
          await tx.walletLedgerEntry.create({
            data: {
              userId: previousLeaderId,
              kind: WalletLedgerKind.release,
              amountCents: lot.currentBidAmountCents,
              lotId,
              bidId: bid.id,
            },
          });
        }
        await tx.walletLedgerEntry.create({
          data: {
            userId: bidderId,
            kind: WalletLedgerKind.commit,
            amountCents,
            lotId,
            bidId: bid.id,
          },
        });

        // periodic seal
        if (seq % SEAL_EVERY === 0) {
          const createdAtIso = new Date().toISOString();
          await tx.auditSeal.create({
            data: {
              lotId,
              seq,
              chainHeadHash: currHash,
              createdAt: new Date(createdAtIso),
              hmac: sealHmac(signingKey, {
                lotId,
                seq,
                chainHeadHash: currHash,
                createdAtIso,
              }),
            },
          });
        }

        return {
          bid,
          newEndsAt,
          extended,
          previousLeaderId,
          leaderUserId: bidderId,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // emit after commit
    this.events.emitBidPlaced({
      lot_id: lotId,
      seq: result.bid.seq,
      amount_cents: result.bid.amountCents.toString(),
      handle: result.bid.handle,
      placed_at: result.bid.placedAt.toISOString(),
      new_ends_at: result.newEndsAt.toISOString(),
      extended: result.extended,
      leader_user_id: result.leaderUserId,
      previous_leader_user_id: result.previousLeaderId,
    });

    return {
      id: result.bid.id,
      seq: result.bid.seq,
      lot_id: lotId,
      amount_cents: result.bid.amountCents.toString(),
      handle: result.bid.handle,
      placed_at: result.bid.placedAt.toISOString(),
      new_ends_at: result.newEndsAt.toISOString(),
      extended: result.extended,
    };
  }

  async listBids(lotId: string, page: number, pageSize: number) {
    const [bids, total] = await this.prisma.$transaction([
      this.prisma.bid.findMany({
        where: { lotId },
        orderBy: { seq: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.bid.count({ where: { lotId } }),
    ]);
    const data = bids.map((b: Bid) => ({
      seq: b.seq,
      amount_cents: b.amountCents.toString(),
      handle: b.handle,
      placed_at: b.placedAt.toISOString(),
    }));
    return { data, page, pageSize, total };
  }
}
