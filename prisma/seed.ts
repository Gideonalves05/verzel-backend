import { PrismaClient, UserRole, LotStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomGlobalHandle } from '../src/common/anon-handle';

const prisma = new PrismaClient();

// Three Met Museum object IDs with images, known to be stable public items.
// If you want to swap them for new ones, pick any `objectID` from
// https://collectionapi.metmuseum.org/public/collection/v1/objects
const MET_IDS = [436535, 437133, 436105]; // Van Gogh (Wheat Field), Monet (Garden), Degas

async function fetchMetObject(id: number) {
  const url = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Met ${id} fetch failed: ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
}

async function upsertUser(email: string, role: UserRole, initialCents: bigint) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash('verzel123', 10);
  const handle = randomGlobalHandle(role);
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      role,
      handle,
      wallet:
        role === UserRole.bidder
          ? { create: { balanceTotalCents: initialCents } }
          : undefined,
    },
  });
}

async function upsertExternalItem(externalId: number) {
  const existing = await prisma.externalItem.findUnique({
    where: {
      provider_externalId: { provider: 'met', externalId: String(externalId) },
    },
  });
  if (existing) return existing;
  const obj = await fetchMetObject(externalId);
  return prisma.externalItem.create({
    data: {
      provider: 'met',
      externalId: String(externalId),
      title: (obj.title as string) || `Untitled #${externalId}`,
      primaryImageUrl: (obj.primaryImage as string) ?? null,
      thumbnailUrl: (obj.primaryImageSmall as string) ?? null,
      culture: (obj.culture as string) ?? null,
      objectDate: (obj.objectDate as string) ?? null,
      medium: (obj.medium as string) ?? null,
      rawJson: obj,
    },
  });
}

async function main() {
  console.log('Seeding users…');
  const auctioneer = await upsertUser(
    'auctioneer@verzel.test',
    UserRole.auctioneer,
    0n,
  );
  const alice = await upsertUser('alice@verzel.test', UserRole.bidder, 1_000_000n);
  const bob = await upsertUser('bob@verzel.test', UserRole.bidder, 1_000_000n);

  console.log('Snapshotting Met items…');
  const items = await Promise.all(MET_IDS.map((id) => upsertExternalItem(id)));

  if ((await prisma.lot.count({ where: { auctioneerId: auctioneer.id } })) > 0) {
    console.log('Lots already seeded — skipping.');
    return;
  }

  const now = Date.now();
  console.log('Creating lots…');

  // Scheduled lot — starts in 2h
  await prisma.lot.create({
    data: {
      auctioneerId: auctioneer.id,
      externalItemId: items[0].id,
      title: items[0].title,
      startsAt: new Date(now + 2 * 60 * 60 * 1000),
      endsAt: new Date(now + 4 * 60 * 60 * 1000),
      originalEndsAt: new Date(now + 4 * 60 * 60 * 1000),
      startingBidCents: 10_000n,
      minIncrementCents: 500n,
      status: LotStatus.scheduled,
    },
  });

  // Ended lot — created in the past and already resolved via a shortcut
  // (we insert bids + settlement by hand so the ended demo lot exists at seed time)
  const endedLot = await prisma.lot.create({
    data: {
      auctioneerId: auctioneer.id,
      externalItemId: items[2].id,
      title: items[2].title,
      startsAt: new Date(now - 4 * 60 * 60 * 1000),
      endsAt: new Date(now - 60 * 60 * 1000),
      originalEndsAt: new Date(now - 60 * 60 * 1000),
      startingBidCents: 20_000n,
      minIncrementCents: 1000n,
      status: LotStatus.live, // the scheduler will settle it on first tick
      currentBidAmountCents: 25_000n,
      currentLeaderUserId: alice.id,
      bidCount: 0, // will not have hash-chain bids — kept simple for seed demo
    },
  });
  // Commit alice's balance manually to mirror the "currently leading" state
  await prisma.wallet.update({
    where: { userId: alice.id },
    data: { balanceCommittedCents: { increment: 25_000n } },
  });

  // Live lot — starts now, ends in 1h, with Alice/Bob exchanging bids
  // We use the real pipeline to keep the hash chain + wallet consistent.
  const liveLot = await prisma.lot.create({
    data: {
      auctioneerId: auctioneer.id,
      externalItemId: items[1].id,
      title: items[1].title,
      startsAt: new Date(now - 10 * 60 * 1000),
      endsAt: new Date(now + 60 * 60 * 1000),
      originalEndsAt: new Date(now + 60 * 60 * 1000),
      startingBidCents: 15_000n,
      minIncrementCents: 500n,
      status: LotStatus.live,
    },
  });

  // Use the compiled dist/ pipeline so hash chain + wallet state stay consistent.
  // Make sure `npm run build` has been executed before `db:seed`.
  const dist = await import('../dist/bidding/bidding.service.js');
  const prismaDist = await import('../dist/prisma/prisma.service.js');
  const eventsDist = await import('../dist/realtime/live-events.service.js');
  const prismaSvc = new prismaDist.PrismaService();
  await prismaSvc.$connect();
  const bidding = new dist.BiddingService(
    prismaSvc,
    new eventsDist.LiveEventsService(),
  );
  await bidding.placeBid(alice.id, liveLot.id, 15_000n);
  await bidding.placeBid(bob.id, liveLot.id, 16_000n);
  await bidding.placeBid(alice.id, liveLot.id, 17_000n);
  await prismaSvc.$disconnect();

  console.log('Seed complete.');
  console.log(`Live lot id = ${liveLot.id}`);
  console.log(`Ended-pending lot id = ${endedLot.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
