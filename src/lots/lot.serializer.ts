import type { ExternalItem, Lot, LotStatus } from '@prisma/client';

export type LotDto = {
  id: string;
  title: string;
  status: LotStatus;
  starts_at: string;
  ends_at: string;
  starting_bid_cents: string;
  min_increment_cents: string;
  current_bid_amount_cents: string | null;
  current_leader_handle: string | null;
  bid_count: number;
  image_url: string | null;
  thumbnail_url: string | null;
  item_attributes: {
    culture: string | null;
    date: string | null;
    medium: string | null;
  };
  source: { provider: string; external_id: string };
  auctioneer_handle: string;
  settled_at: string | null;
};

export function effectiveStatus(lot: Lot, now = new Date()): LotStatus {
  if (lot.status === 'cancelled' || lot.status === 'ended') return lot.status;
  if (lot.startsAt > now) return 'scheduled';
  if (lot.endsAt <= now) return 'live'; // scheduler will transition to ended
  return 'live';
}

export function serializeLot(
  lot: Lot & { externalItem: ExternalItem; auctioneer: { handle: string } },
  opts?: { currentLeaderHandle?: string | null },
): LotDto {
  return {
    id: lot.id,
    title: lot.title,
    status: effectiveStatus(lot),
    starts_at: lot.startsAt.toISOString(),
    ends_at: lot.endsAt.toISOString(),
    starting_bid_cents: lot.startingBidCents.toString(),
    min_increment_cents: lot.minIncrementCents.toString(),
    current_bid_amount_cents:
      lot.currentBidAmountCents?.toString() ?? null,
    current_leader_handle: opts?.currentLeaderHandle ?? null,
    bid_count: lot.bidCount,
    image_url: lot.externalItem.primaryImageUrl,
    thumbnail_url: lot.externalItem.thumbnailUrl,
    item_attributes: {
      culture: lot.externalItem.culture,
      date: lot.externalItem.objectDate,
      medium: lot.externalItem.medium,
    },
    source: {
      provider: lot.externalItem.provider,
      external_id: lot.externalItem.externalId,
    },
    auctioneer_handle: lot.auctioneer.handle,
    settled_at: lot.settledAt?.toISOString() ?? null,
  };
}
