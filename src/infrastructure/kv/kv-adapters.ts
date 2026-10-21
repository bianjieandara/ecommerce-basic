// KV adapters: the generic JSON cache and the page-cache version that invalidates cached HTML after admin saves.
import type { CacheStore, PageCacheVersion } from '@/application/ports/platform';

/** Key of the page-cache version. Changing it makes every cached page a miss. */
export const PAGE_CACHE_VERSION_KEY = 'page-cache:version';

/** JSON cache on Workers KV. */
export class KvCacheStore implements CacheStore {
  /** @param kv KV namespace binding. */
  constructor(private readonly kv: KVNamespace) {}

  async getJson<T>(key: string): Promise<T | null> {
    return this.kv.get<T>(key, 'json');
  }

  async putJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.kv.put(
      key,
      JSON.stringify(value),
      ttlSeconds ? { expirationTtl: Math.max(60, ttlSeconds) } : undefined,
    );
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }
}

/** Page-cache version stored in KV. Reads are cached for 60 seconds at the edge to keep KV reads low. */
export class KvPageCacheVersion implements PageCacheVersion {
  /** @param kv KV namespace binding. */
  constructor(private readonly kv: KVNamespace) {}

  async current(): Promise<string> {
    return (await this.kv.get(PAGE_CACHE_VERSION_KEY, { cacheTtl: 60 })) ?? '1';
  }

  async bump(): Promise<void> {
    await this.kv.put(PAGE_CACHE_VERSION_KEY, Date.now().toString(36));
  }
}
