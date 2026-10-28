import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/filters/http-exception.filter';
import {
  canonicalBidJson,
  chainNext,
  genesisHash,
  sealHmac,
} from './hash-chain';
import { deriveLotHandle } from '../common/anon-handle';

export type IntegrityResult = {
  ok: boolean;
  verified_at: string;
  head_hash: string | null;
  first_failure?: { seq: number; reason: string };
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async getLot(lotId: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      include: {
        externalItem: true,
        auctioneer: { select: { handle: true, id: true } },
        settlement: { include: { winner: { select: { id: true } } } },
      },
    });
    if (!lot) throw new DomainError('not_found', 'Lot not found', 404);

    const bids = await this.prisma.bid.findMany({
      where: { lotId },
      orderBy: { seq: 'asc' },
    });
    const seals = await this.prisma.auditSeal.findMany({
      where: { lotId },
      orderBy: { seq: 'asc' },
    });

    const signingKey = process.env.AUDIT_SIGNING_KEY ?? 'dev-key';
    const integrity = this.verify(lotId, bids, seals, signingKey);

    const winnerUserId = lot.settlement?.winnerUserId ?? null;

    return {
      lot: {
        id: lot.id,
        title: lot.title,
        status: lot.status,
        image_url: lot.externalItem.primaryImageUrl,
        source: {
          provider: lot.externalItem.provider,
          external_id: lot.externalItem.externalId,
        },
        starts_at: lot.startsAt.toISOString(),
        ends_at: lot.endsAt.toISOString(),
        settled_at: lot.settledAt?.toISOString() ?? null,
        auctioneer_handle: lot.auctioneer.handle,
        winner_handle:
          winnerUserId
            ? deriveLotHandle(signingKey, winnerUserId, lot.id)
            : null,
        final_amount_cents: lot.settlement?.amountCents?.toString() ?? null,
      },
      bids: bids.map((b) => ({
        seq: b.seq,
        amount_cents: b.amountCents.toString(),
        handle: b.handle,
        placed_at: b.placedAt.toISOString(),
        prev_hash: b.prevHash,
        curr_hash: b.currHash,
      })),
      seals: seals.map((s) => ({
        seq: s.seq,
        chain_head_hash: s.chainHeadHash,
        created_at: s.createdAt.toISOString(),
        key_id: s.keyId,
        hmac: s.hmac,
        final: s.final,
      })),
      integrity,
      key_id: 'primary',
    };
  }

  async getReceiptByToken(token: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { shareToken: token },
      include: {
        settlement: {
          include: {
            lot: { include: { externalItem: true } },
            winner: { select: { id: true } },
            auctioneer: { select: { handle: true, id: true } },
          },
        },
      },
    });
    if (!receipt) throw new DomainError('not_found', 'Receipt not found', 404);
    const settlement = receipt.settlement;
    const signingKey = process.env.AUDIT_SIGNING_KEY ?? 'dev-key';

    const latestSeal = await this.prisma.auditSeal.findFirst({
      where: { lotId: settlement.lotId },
      orderBy: { seq: 'desc' },
    });

    return {
      lot: {
        id: settlement.lot.id,
        title: settlement.lot.title,
        image_url: settlement.lot.externalItem.primaryImageUrl,
        source: {
          provider: settlement.lot.externalItem.provider,
          external_id: settlement.lot.externalItem.externalId,
        },
      },
      winner_handle:
        settlement.winnerUserId
          ? deriveLotHandle(
              signingKey,
              settlement.winnerUserId,
              settlement.lotId,
            )
          : null,
      amount_cents: settlement.amountCents.toString(),
      settled_at: settlement.settledAt.toISOString(),
      auctioneer_handle: settlement.auctioneer.handle,
      integrity_head_hash: latestSeal?.chainHeadHash ?? null,
      audit_url: `/api/audit/lots/${settlement.lotId}`,
    };
  }

  verify(
    lotId: string,
    bids: Array<{
      seq: number;
      amountCents: bigint;
      handle: string;
      placedAt: Date;
      prevHash: string;
      currHash: string;
    }>,
    seals: Array<{
      seq: number;
      chainHeadHash: string;
      createdAt: Date;
      keyId: string;
      hmac: string;
    }>,
    signingKey: string,
  ): IntegrityResult {
    const verifiedAt = new Date().toISOString();
    let expectedPrev = genesisHash(lotId);
    let headHash: string | null = null;
    let expectedSeq = 1;

    for (const b of bids) {
      if (b.seq !== expectedSeq) {
        return {
          ok: false,
          verified_at: verifiedAt,
          head_hash: headHash,
          first_failure: { seq: b.seq, reason: 'seq_gap' },
        };
      }
      if (b.prevHash !== expectedPrev) {
        return {
          ok: false,
          verified_at: verifiedAt,
          head_hash: headHash,
          first_failure: { seq: b.seq, reason: 'prev_hash_mismatch' },
        };
      }
      const canonical = canonicalBidJson({
        lotId,
        seq: b.seq,
        handle: b.handle,
        amountCents: b.amountCents,
        placedAtIso: b.placedAt.toISOString(),
      });
      const expectedCurr = chainNext(b.prevHash, canonical);
      if (expectedCurr !== b.currHash) {
        return {
          ok: false,
          verified_at: verifiedAt,
          head_hash: headHash,
          first_failure: { seq: b.seq, reason: 'curr_hash_mismatch' },
        };
      }
      headHash = b.currHash;
      expectedPrev = b.currHash;
      expectedSeq++;
    }

    for (const s of seals) {
      const expectedHmac = sealHmac(signingKey, {
        lotId,
        seq: s.seq,
        chainHeadHash: s.chainHeadHash,
        createdAtIso: s.createdAt.toISOString(),
      });
      if (expectedHmac !== s.hmac) {
        return {
          ok: false,
          verified_at: verifiedAt,
          head_hash: headHash,
          first_failure: { seq: s.seq, reason: 'seal_hmac_invalid' },
        };
      }
      const bidAtSeq = bids.find((b) => b.seq === s.seq);
      if (!bidAtSeq || bidAtSeq.currHash !== s.chainHeadHash) {
        return {
          ok: false,
          verified_at: verifiedAt,
          head_hash: headHash,
          first_failure: { seq: s.seq, reason: 'seal_mismatch' },
        };
      }
    }

    return {
      ok: true,
      verified_at: verifiedAt,
      head_hash: headHash,
    };
  }
}
