import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../common/filters/http-exception.filter';

export type MetSearchHit = {
  objectID: number;
};

export type MetObject = {
  objectID: number;
  title: string;
  primaryImage?: string;
  primaryImageSmall?: string;
  culture?: string;
  objectDate?: string;
  medium?: string;
  objectURL?: string;
  [k: string]: unknown;
};

@Injectable()
export class MetClient {
  private readonly logger = new Logger(MetClient.name);
  private readonly baseUrl =
    process.env.MET_API_BASE_URL ??
    'https://collectionapi.metmuseum.org/public/collection/v1';
  private readonly timeoutMs = Number(process.env.MET_API_TIMEOUT_MS ?? 5000);

  async search(q: string): Promise<MetSearchHit[]> {
    const url = `${this.baseUrl}/search?hasImages=true&q=${encodeURIComponent(q)}`;
    try {
      const resp = await this.fetchJson<{ objectIDs: number[] | null }>(url);
      const ids = resp.objectIDs ?? [];
      return ids.map((id) => ({ objectID: id }));
    } catch (err) {
      this.logger.warn(`Met search failed: ${(err as Error).message}`);
      throw new DomainError(
        'external_source_unavailable',
        'External items source is unavailable, please try again',
        503,
      );
    }
  }

  async getObject(objectId: number | string): Promise<MetObject> {
    const url = `${this.baseUrl}/objects/${objectId}`;
    try {
      return await this.fetchJson<MetObject>(url);
    } catch (err) {
      this.logger.warn(
        `Met object ${objectId} failed: ${(err as Error).message}`,
      );
      throw new DomainError(
        'external_source_unavailable',
        'Could not fetch item details from external source',
        503,
      );
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      return (await resp.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
