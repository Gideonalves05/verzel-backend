import { Injectable } from '@nestjs/common';
import { LotStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExternalItemsService } from '../external-items/external-items.service';
import { DomainError } from '../common/filters/http-exception.filter';
import { deriveLotHandle } from '../common/anon-handle';
import {
  effectiveStatus,
  serializeLot,
  type LotDto,
} from './lot.serializer';
import type { CreateLotDto, ListLotsQueryDto } from './dto';

@Injectable()
export class LotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly external: ExternalItemsService,
  ) {}

  async create(auctioneerId: string, dto: CreateLotDto): Promise<LotDto> {
    const startsAt = new Date(dto.starts_at);
    const endsAt = new Date(dto.ends_at);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new DomainError('validation_error', 'Invalid dates', 400);
    }
    if (endsAt <= startsAt) {
      throw new DomainError(
        'validation_error',
        'ends_at must be after starts_at',
        400,
        { field: 'ends_at' },
      );
    }
    if (startsAt.getTime() < Date.now() - 1000) {
      throw new DomainError(
        'validation_error',
        'starts_at must be now or in the future',
        400,
        { field: 'starts_at' },
      );
    }
    if (dto.provider !== 'met') {
      throw new DomainError(
        'validation_error',
        "Only provider 'met' is supported",
        400,
      );
    }
    const starting = BigInt(dto.starting_bid_cents);
    const increment = BigInt(dto.min_increment_cents);

    const item = await this.external.snapshot('met', dto.external_id);
    const auctioneer = await this.prisma.user.findUnique({
      where: { id: auctioneerId },
    });
    if (!auctioneer) {
      throw new DomainError('unauthorized', 'User not found', 401);
    }

    const now = new Date();
    const status: LotStatus =
      startsAt <= now ? LotStatus.live : LotStatus.scheduled;

    const lot = await this.prisma.lot.create({
      data: {
        auctioneerId,
        externalItemId: item.id,
        title: dto.title && dto.title.trim().length > 0 ? dto.title : item.title,
        startsAt,
        endsAt,
        originalEndsAt: endsAt,
        startingBidCents: starting,
        minIncrementCents: increment,
        status,
      },
      include: { externalItem: true, auctioneer: { select: { handle: true } } },
    });
    return serializeLot(lot);
  }

  async list(query: ListLotsQueryDto) {
    const page = query.page;
    const pageSize = query.pageSize;
    const now = new Date();

    const where: Prisma.LotWhereInput = {
      status: { not: LotStatus.cancelled },
    };
    if (query.status) {
      if (query.status === LotStatus.cancelled) {
        return { data: [], page, pageSize, total: 0 };
      }
      if (query.status === LotStatus.scheduled) {
        where.AND = [
          { status: { in: [LotStatus.scheduled, LotStatus.live] } },
          { startsAt: { gt: now } },
        ];
      } else if (query.status === LotStatus.live) {
        where.AND = [
          { status: { in: [LotStatus.scheduled, LotStatus.live] } },
          { startsAt: { lte: now } },
          { endsAt: { gt: now } },
        ];
      } else if (query.status === LotStatus.ended) {
        where.OR = [
          { status: LotStatus.ended },
          {
            AND: [
              { status: { not: LotStatus.cancelled } },
              { endsAt: { lte: now } },
            ],
          },
        ];
        delete where.status;
      }
    }
    if (query.q && query.q.length > 0) {
      where.title = { contains: query.q, mode: 'insensitive' };
    }

    const [lots, total] = await this.prisma.$transaction([
      this.prisma.lot.findMany({
        where,
        include: {
          externalItem: true,
          auctioneer: { select: { handle: true } },
        },
        orderBy: [{ endsAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lot.count({ where }),
    ]);

    const data = await Promise.all(
      lots.map(async (l) => {
        const handle = await this.resolveLeaderHandle(l.id, l.currentLeaderUserId);
        return serializeLot(l, { currentLeaderHandle: handle });
      }),
    );
    return { data, page, pageSize, total };
  }

  async get(id: string): Promise<LotDto> {
    const lot = await this.prisma.lot.findUnique({
      where: { id },
      include: {
        externalItem: true,
        auctioneer: { select: { handle: true } },
      },
    });
    if (!lot || lot.status === LotStatus.cancelled) {
      throw new DomainError('not_found', 'Lot not found', 404);
    }
    const handle = await this.resolveLeaderHandle(lot.id, lot.currentLeaderUserId);
    return serializeLot(lot, { currentLeaderHandle: handle });
  }

  async cancel(auctioneerId: string, lotId: string): Promise<LotDto> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      include: {
        externalItem: true,
        auctioneer: { select: { handle: true } },
      },
    });
    if (!lot) {
      throw new DomainError('not_found', 'Lot not found', 404);
    }
    if (lot.auctioneerId !== auctioneerId) {
      throw new DomainError(
        'not_lot_owner',
        "Only the lot's auctioneer can cancel it",
        403,
      );
    }
    if (lot.status === LotStatus.cancelled) {
      return serializeLot(lot);
    }
    if (lot.status === LotStatus.ended) {
      throw new DomainError(
        'lot_ended',
        'Lot has already ended',
        409,
      );
    }
    if (lot.bidCount > 0) {
      throw new DomainError(
        'lot_has_bids_cannot_cancel',
        'Lot has bids and cannot be cancelled',
        409,
      );
    }
    const updated = await this.prisma.lot.update({
      where: { id: lotId },
      data: { status: LotStatus.cancelled, cancelledAt: new Date() },
      include: {
        externalItem: true,
        auctioneer: { select: { handle: true } },
      },
    });
    return serializeLot(updated);
  }

  async listMine(auctioneerId: string) {
    const lots = await this.prisma.lot.findMany({
      where: { auctioneerId },
      include: {
        externalItem: true,
        auctioneer: { select: { handle: true } },
        settlement: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    return Promise.all(
      lots.map(async (l) => {
        const handle = await this.resolveLeaderHandle(l.id, l.currentLeaderUserId);
        const base = serializeLot(l, { currentLeaderHandle: handle });
        return {
          ...base,
          winner_handle:
            l.settlement?.winnerUserId
              ? deriveLotHandle(
                  process.env.AUDIT_SIGNING_KEY ?? 'dev-key',
                  l.settlement.winnerUserId,
                  l.id,
                )
              : null,
          final_amount_cents:
            l.settlement?.amountCents?.toString() ?? null,
        };
      }),
    );
  }

  async revenue(auctioneerId: string) {
    const settlements = await this.prisma.settlement.findMany({
      where: { auctioneerUserId: auctioneerId, winnerUserId: { not: null } },
      select: { amountCents: true },
    });
    const total = settlements.reduce(
      (acc, s) => acc + s.amountCents,
      0n,
    );
    return {
      total_received_cents: total.toString(),
      settled_lot_count: settlements.length,
    };
  }

  private async resolveLeaderHandle(
    lotId: string,
    leaderId: string | null,
  ): Promise<string | null> {
    if (!leaderId) return null;
    return deriveLotHandle(
      process.env.AUDIT_SIGNING_KEY ?? 'dev-key',
      leaderId,
      lotId,
    );
  }
}
