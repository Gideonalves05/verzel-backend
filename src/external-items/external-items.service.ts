import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetClient, type MetObject } from './met.client';

type CachedSearch = {
  at: number;
  data: ExternalItemSearchHit[];
};

export type ExternalItemSearchHit = {
  provider: 'met';
  external_id: string;
  title: string;
  primary_image_url: string | null;
  thumbnail_url: string | null;
  culture: string | null;
  date: string | null;
};

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_PAGE_SIZE = 20;
const MAX_DETAIL_FETCH = 20;

@Injectable()
export class ExternalItemsService {
  private readonly cache = new Map<string, CachedSearch>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly met: MetClient,
  ) {}

  async search(
    q: string,
    page = 1,
  ): Promise<{ data: ExternalItemSearchHit[]; page: number; pageSize: number; total: number }> {
    const key = `search:${q.toLowerCase().trim()}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    let hits: ExternalItemSearchHit[];
    if (cached && now - cached.at < SEARCH_CACHE_TTL_MS) {
      hits = cached.data;
    } else {
      const ids = await this.met.search(q);
      const subset = ids.slice(0, MAX_DETAIL_FETCH);
      const objects = await Promise.allSettled(
        subset.map((h) => this.met.getObject(h.objectID)),
      );
      hits = objects
        .filter(
          (r): r is PromiseFulfilledResult<MetObject> =>
            r.status === 'fulfilled' && !!r.value?.primaryImage,
        )
        .map((r) => this.toHit(r.value));
      this.cache.set(key, { at: now, data: hits });
    }

    const start = (page - 1) * SEARCH_PAGE_SIZE;
    const slice = hits.slice(start, start + SEARCH_PAGE_SIZE);
    return {
      data: slice,
      page,
      pageSize: SEARCH_PAGE_SIZE,
      total: hits.length,
    };
  }

  async snapshot(provider: 'met', externalId: string | number) {
    const extIdStr = String(externalId);
    const existing = await this.prisma.externalItem.findUnique({
      where: {
        provider_externalId: { provider, externalId: extIdStr },
      },
    });
    if (existing) return existing;

    const obj = await this.met.getObject(extIdStr);
    return this.prisma.externalItem.create({
      data: {
        provider,
        externalId: extIdStr,
        title: obj.title || `Untitled #${extIdStr}`,
        primaryImageUrl: obj.primaryImage ?? null,
        thumbnailUrl: obj.primaryImageSmall ?? null,
        culture: obj.culture ?? null,
        objectDate: obj.objectDate ?? null,
        medium: obj.medium ?? null,
        rawJson: obj as unknown as object,
      },
    });
  }

  private toHit(obj: MetObject): ExternalItemSearchHit {
    return {
      provider: 'met',
      external_id: String(obj.objectID),
      title: obj.title || `Untitled #${obj.objectID}`,
      primary_image_url: obj.primaryImage ?? null,
      thumbnail_url: obj.primaryImageSmall ?? null,
      culture: obj.culture ?? null,
      date: obj.objectDate ?? null,
    };
  }
}
