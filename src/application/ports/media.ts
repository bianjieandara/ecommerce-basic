// Media ports: image bytes in R2 and image metadata in D1.
import type { MediaVariant } from '@/domain/media/media-asset';
import type { Locale } from '@/domain/shared/locale';
import type { Paginated } from '@/domain/shared/pagination';

/** Stored image metadata. Bytes live in R2 under the variant keys. */
export interface MediaAsset {
  id: string;
  originalName: string;
  mimeType: string;
  width: number;
  height: number;
  variants: MediaVariant[];
  alt: Partial<Record<Locale, string>>;
  bytesTotal: number;
  createdAt: string;
}

/** Object storage for image variants and generated files (R2). */
export interface MediaStorage {
  put(key: string, body: ReadableStream | ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream; contentType: string; etag: string } | null>;
  getBytes(key: string): Promise<ArrayBuffer | null>;
  delete(keys: string[]): Promise<void>;
}

/** Media metadata persistence. */
export interface MediaRepository {
  list(page: number, pageSize: number): Promise<Paginated<MediaAsset>>;
  findById(id: string): Promise<MediaAsset | null>;
  findManyByIds(ids: string[]): Promise<MediaAsset[]>;
  save(asset: MediaAsset): Promise<void>;
  updateAlt(id: string, alt: Partial<Record<Locale, string>>): Promise<void>;
  delete(id: string): Promise<void>;
  isInUse(id: string): Promise<boolean>;
}
