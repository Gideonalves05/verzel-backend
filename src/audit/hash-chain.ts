import { createHash, createHmac } from 'crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function genesisHash(lotId: string): string {
  return sha256Hex(`lot:${lotId}:genesis`);
}

export function canonicalBidJson(fields: {
  lotId: string;
  seq: number;
  handle: string;
  amountCents: bigint | string;
  placedAtIso: string;
}): string {
  const payload = {
    amount_cents: fields.amountCents.toString(),
    handle: fields.handle,
    lot_id: fields.lotId,
    placed_at: fields.placedAtIso,
    seq: fields.seq,
  };
  const keys = Object.keys(payload).sort() as (keyof typeof payload)[];
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = payload[k];
  return JSON.stringify(ordered);
}

export function chainNext(
  prevHash: string,
  canonical: string,
): string {
  return sha256Hex(`${prevHash}|${canonical}`);
}

export function sealHmac(
  signingKey: string,
  fields: {
    lotId: string;
    seq: number;
    chainHeadHash: string;
    createdAtIso: string;
  },
): string {
  const material = `${fields.lotId}:${fields.seq}:${fields.chainHeadHash}:${fields.createdAtIso}`;
  return createHmac('sha256', signingKey).update(material).digest('hex');
}
