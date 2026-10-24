// Media library: stores the resized variants a browser produced, and removes assets that no product or category uses.
import {
  MAX_UPLOAD_BYTES,
  MEDIA_WIDTHS,
  isVariantMime,
  mediaVariantKey,
  sniffImageMime,
} from '@/domain/media/media-asset';
import { DomainError } from '@/domain/shared/errors';
import type { Locale } from '@/domain/shared/locale';
import type { Paginated } from '@/domain/shared/pagination';
import type { MediaAsset, MediaRepository, MediaStorage } from '../ports/media';
import type { Clock, IdGenerator } from '../ports/platform';

/** One resized size of an upload. */
export interface UploadedVariant {
  width: number;
  bytes: ArrayBuffer;
}

/** An upload: the original's size and the resized variants the browser made. */
export interface MediaUpload {
  originalName: string;
  width: number;
  height: number;
  variants: UploadedVariant[];
}

/** Dependencies of MediaLibrary. */
export interface MediaLibraryDeps {
  media: MediaRepository;
  storage: MediaStorage;
  ids: IdGenerator;
  clock: Clock;
}

/** Largest pixel size accepted for the original. Larger values are not photos, they are mistakes. */
const MAX_DIMENSION = 20000;

/** Longest alternative text per language. */
export const MAX_ALT_LENGTH = 200;

/** Stores, lists and removes images. */
export class MediaLibrary {
  /** @param deps Repository, object storage, ids and clock. */
  constructor(private readonly deps: MediaLibraryDeps) {}

  /**
   * Stores the variants of one image. Each variant is checked by its bytes, not by its name or declared type.
   * @param upload Original size and the resized variants.
   * @returns The stored asset.
   * @throws DomainError VALIDATION_FAILED for a bad size, an unknown or repeated width, a file that is not WebP or JPEG,
   * or more than 10 MB in total.
   */
  async upload(upload: MediaUpload): Promise<MediaAsset> {
    const widths = new Set(upload.variants.map((variant) => variant.width));
    // A size is a store width, or the original's own width when the original is narrower than the smallest store width.
    const knownWidths: readonly number[] = [...MEDIA_WIDTHS, upload.width];
    if (upload.variants.length === 0 || widths.size !== upload.variants.length) {
      throw new DomainError('VALIDATION_FAILED', 'Upload one image per width, without repeats');
    }
    if (
      upload.variants.some((variant) => !knownWidths.includes(variant.width) || variant.width > upload.width)
    ) {
      throw new DomainError('VALIDATION_FAILED', 'Unknown image width');
    }
    if (!isSize(upload.width) || !isSize(upload.height)) {
      throw new DomainError('VALIDATION_FAILED', 'The image size is not valid');
    }
    const total = upload.variants.reduce((sum, variant) => sum + variant.bytes.byteLength, 0);
    if (total > MAX_UPLOAD_BYTES)
      throw new DomainError('VALIDATION_FAILED', 'The image is larger than 10 MB');

    const id = this.deps.ids.newId();
    const staged = upload.variants.map((variant) => {
      const detected = sniffImageMime(new Uint8Array(variant.bytes.slice(0, 12)));
      if (!detected || !isVariantMime(detected)) {
        throw new DomainError('VALIDATION_FAILED', 'Only WebP and JPEG images are stored');
      }
      return {
        width: variant.width,
        mime: detected,
        bytes: variant.bytes,
        key: mediaVariantKey(id, variant.width, detected),
      };
    });
    await Promise.all(staged.map((item) => this.deps.storage.put(item.key, item.bytes, item.mime)));

    const asset: MediaAsset = {
      id,
      originalName: upload.originalName,
      mimeType: staged[0]?.mime ?? 'image/webp',
      width: upload.width,
      height: upload.height,
      variants: staged
        .map((item) => ({ width: item.width, key: item.key, bytes: item.bytes.byteLength }))
        .sort((a, b) => a.width - b.width),
      alt: {},
      bytesTotal: total,
      createdAt: this.deps.clock.now().toISOString(),
    };
    try {
      await this.deps.media.save(asset);
    } catch (error) {
      // The metadata failed to save, so the stored files would be unreachable: remove them.
      await this.deps.storage.delete(staged.map((item) => item.key));
      throw error;
    }
    return asset;
  }

  /**
   * Lists assets, newest first.
   * @param page Page number, from 1.
   * @param pageSize Assets per page.
   * @returns One page of assets.
   */
  list(page: number, pageSize: number): Promise<Paginated<MediaAsset>> {
    return this.deps.media.list(page, pageSize);
  }

  /**
   * Reads several assets at once, for pages that show pictures chosen in the admin.
   * @param ids Asset ids; unknown ids are left out of the result.
   * @returns The assets found, in no particular order.
   */
  getMany(ids: string[]): Promise<MediaAsset[]> {
    return ids.length > 0 ? this.deps.media.findManyByIds(ids) : Promise.resolve([]);
  }

  /**
   * Replaces the alternative text of an image, the description screen readers and search engines use. A language left empty is
   * dropped, so the page falls back to the product's name there.
   * @param id Asset id.
   * @param alt Text per language, up to 200 characters each.
   * @returns The text that was stored.
   * @throws DomainError NOT_FOUND for an unknown image, VALIDATION_FAILED for a text that is too long.
   */
  async updateAlt(
    id: string,
    alt: Partial<Record<Locale, string>>,
  ): Promise<Partial<Record<Locale, string>>> {
    if (!(await this.deps.media.findById(id))) throw new DomainError('NOT_FOUND', 'Image not found');
    const clean: Partial<Record<Locale, string>> = {};
    for (const locale of ['es', 'en'] as const) {
      const text = (alt[locale] ?? '').trim();
      if (text.length > MAX_ALT_LENGTH)
        throw new DomainError('VALIDATION_FAILED', 'The description is too long');
      if (text) clean[locale] = text;
    }
    await this.deps.media.updateAlt(id, clean);
    return clean;
  }

  /**
   * Deletes an asset and its stored sizes. Refused while a product, a category or a testimonial still uses it.
   * @param id Asset id.
   * @throws DomainError NOT_FOUND, or CONFLICT while the asset is in use.
   */
  async remove(id: string): Promise<void> {
    const asset = await this.deps.media.findById(id);
    if (!asset) throw new DomainError('NOT_FOUND', 'Image not found');
    if (await this.deps.media.isInUse(id)) {
      throw new DomainError(
        'CONFLICT',
        'The image is still used. Remove it from products or categories first.',
      );
    }
    await this.deps.storage.delete(asset.variants.map((variant) => variant.key));
    await this.deps.media.delete(id);
  }
}

/**
 * True for a sensible pixel size of the original.
 * @param value Candidate width or height.
 * @returns Whether it is a whole number of pixels within the limit.
 */
function isSize(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_DIMENSION;
}
