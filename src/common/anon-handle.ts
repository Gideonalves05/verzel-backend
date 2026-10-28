import { createHmac, randomBytes } from 'crypto';

export function randomGlobalHandle(role: 'auctioneer' | 'bidder'): string {
  const suffix = randomBytes(2).toString('hex');
  return `${role}-${suffix}`;
}

const BS58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function bytesToBase58(bytes: Buffer): string {
  let num = BigInt('0x' + bytes.toString('hex'));
  const out: string[] = [];
  const base = 58n;
  while (num > 0n) {
    const rem = num % base;
    num /= base;
    out.push(BS58_ALPHABET[Number(rem)]);
  }
  for (const b of bytes) {
    if (b === 0) out.push(BS58_ALPHABET[0]);
    else break;
  }
  return out.reverse().join('');
}

export function deriveLotHandle(
  signingKey: string,
  userId: string,
  lotId: string,
): string {
  const h = createHmac('sha256', signingKey)
    .update(`${userId}:${lotId}`)
    .digest();
  return bytesToBase58(h).slice(0, 8);
}
