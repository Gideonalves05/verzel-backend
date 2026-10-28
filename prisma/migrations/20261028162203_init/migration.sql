-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('auctioneer', 'bidder');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('scheduled', 'live', 'ended', 'cancelled');

-- CreateEnum
CREATE TYPE "WalletLedgerKind" AS ENUM ('deposit', 'commit', 'release', 'debit', 'credit');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "handle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balanceTotalCents" BIGINT NOT NULL DEFAULT 0,
    "balanceCommittedCents" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "WalletLedgerKind" NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "lotId" TEXT,
    "bidId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalItem" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "primaryImageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "culture" TEXT,
    "objectDate" TEXT,
    "medium" TEXT,
    "rawJson" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "auctioneerId" TEXT NOT NULL,
    "externalItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "originalEndsAt" TIMESTAMP(3) NOT NULL,
    "startingBidCents" BIGINT NOT NULL,
    "minIncrementCents" BIGINT NOT NULL,
    "status" "LotStatus" NOT NULL DEFAULT 'scheduled',
    "currentBidAmountCents" BIGINT,
    "currentLeaderUserId" TEXT,
    "bidCount" INTEGER NOT NULL DEFAULT 0,
    "settledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "handle" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prevHash" TEXT NOT NULL,
    "currHash" TEXT NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditSeal" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "chainHeadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keyId" TEXT NOT NULL DEFAULT 'primary',
    "hmac" TEXT NOT NULL,
    "final" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AuditSeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "winnerUserId" TEXT,
    "auctioneerUserId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL DEFAULT 0,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_userId_idx" ON "WalletLedgerEntry"("userId");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_lotId_idx" ON "WalletLedgerEntry"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalItem_provider_externalId_key" ON "ExternalItem"("provider", "externalId");

-- CreateIndex
CREATE INDEX "Lot_status_endsAt_idx" ON "Lot"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Lot_auctioneerId_idx" ON "Lot"("auctioneerId");

-- CreateIndex
CREATE INDEX "Bid_lotId_placedAt_idx" ON "Bid"("lotId", "placedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_lotId_seq_key" ON "Bid"("lotId", "seq");

-- CreateIndex
CREATE INDEX "AuditSeal_lotId_seq_idx" ON "AuditSeal"("lotId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_lotId_key" ON "Settlement"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_settlementId_key" ON "Receipt"("settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_shareToken_key" ON "Receipt"("shareToken");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedgerEntry" ADD CONSTRAINT "WalletLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_auctioneerId_fkey" FOREIGN KEY ("auctioneerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_externalItemId_fkey" FOREIGN KEY ("externalItemId") REFERENCES "ExternalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditSeal" ADD CONSTRAINT "AuditSeal_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_auctioneerUserId_fkey" FOREIGN KEY ("auctioneerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
