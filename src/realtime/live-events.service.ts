import { Injectable } from '@nestjs/common';

export type BidPlacedEvent = {
  lot_id: string;
  seq: number;
  amount_cents: string;
  handle: string;
  placed_at: string;
  new_ends_at: string;
  extended: boolean;
  leader_user_id: string;
  previous_leader_user_id: string | null;
};

export type LotEndedEvent = {
  lot_id: string;
  winner_handle: string | null;
  winner_user_id: string | null;
  final_amount_cents: string | null;
  settled_at: string;
  receipt_token: string | null;
};

export type EventHandler = {
  onBidPlaced?: (ev: BidPlacedEvent) => void;
  onLotEnded?: (ev: LotEndedEvent) => void;
};

@Injectable()
export class LiveEventsService {
  private handlers: EventHandler[] = [];

  register(handler: EventHandler) {
    this.handlers.push(handler);
  }

  emitBidPlaced(ev: BidPlacedEvent) {
    for (const h of this.handlers) {
      try {
        h.onBidPlaced?.(ev);
      } catch {
        // isolate handler errors
      }
    }
  }

  emitLotEnded(ev: LotEndedEvent) {
    for (const h of this.handlers) {
      try {
        h.onLotEnded?.(ev);
      } catch {
        // isolate handler errors
      }
    }
  }
}
