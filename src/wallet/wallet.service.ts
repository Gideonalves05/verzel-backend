import { Injectable } from '@nestjs/common';
import { Prisma, UserRole, WalletLedgerKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/filters/http-exception.filter';

export type WalletView = {
  total_cents: string;
  committed_cents: string;
  available_cents: string;
};

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string): Promise<WalletView> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    if (!wallet) {
      throw new DomainError(
        'role_forbidden',
        'Only bidders have wallets',
        403,
      );
    }
    return this.toView(wallet.balanceTotalCents, wallet.balanceCommittedCents);
  }

  async deposit(userId: string, amountCents: bigint): Promise<WalletView> {
    if (amountCents <= 0n) {
      throw new DomainError(
        'validation_error',
        'amount_cents must be positive',
        400,
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== UserRole.bidder) {
      throw new DomainError(
        'role_forbidden',
        'Only bidders have wallets',
        403,
      );
    }
    const wallet = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.wallet.update({
        where: { userId },
        data: {
          balanceTotalCents: { increment: amountCents },
        },
      });
      await tx.walletLedgerEntry.create({
        data: {
          userId,
          kind: WalletLedgerKind.deposit,
          amountCents,
        },
      });
      return updated;
    });
    return this.toView(wallet.balanceTotalCents, wallet.balanceCommittedCents);
  }

  toView(total: bigint, committed: bigint): WalletView {
    const available = total - committed;
    return {
      total_cents: total.toString(),
      committed_cents: committed.toString(),
      available_cents: available.toString(),
    };
  }
}
