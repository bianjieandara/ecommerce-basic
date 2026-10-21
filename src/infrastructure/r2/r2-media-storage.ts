// Object storage on R2: image variants and generated files (invoice PDFs).
import type { MediaStorage } from '@/application/ports/media';

/** R2 implementation of MediaStorage. */
export class R2MediaStorage implements MediaStorage {
  /** @param bucket R2 bucket binding. */
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, body: ReadableStream | ArrayBuffer, contentType: string): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
    });
  }

  async get(key: string): Promise<{ body: ReadableStream; contentType: string; etag: string } | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
      etag: object.httpEtag,
    };
  }

  async getBytes(key: string): Promise<ArrayBuffer | null> {
    const object = await this.bucket.get(key);
    return object ? object.arrayBuffer() : null;
  }

  async delete(keys: string[]): Promise<void> {
    if (keys.length > 0) await this.bucket.delete(keys);
  }
}
