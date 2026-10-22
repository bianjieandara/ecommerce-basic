// Media library: upload photos (resized in the browser first), browse the library, and delete what nothing uses.
import { useState } from 'preact/hooks';
import { getJson, postForm, postJson } from './lib/api-client';
import { BUTTON, ERROR_TEXT, LINK_BUTTON, PANEL } from './lib/classes';
import { resizeImage } from './lib/image-processing';
import type { AdminLabels } from './ProductFields';

/** One image of the library as the page shows it. */
export interface MediaItem {
  id: string;
  src: string;
  name: string;
}

/** Props of the media library. */
export interface MediaLibraryProps {
  assets: MediaItem[];
  labels: AdminLabels;
  errors: Record<string, string>;
}

/** What the upload endpoint answers with: the stored asset. */
interface StoredAsset {
  id: string;
  originalName: string;
  variants: { width: number; key: string; bytes: number }[];
}

/**
 * Converts a stored asset to a list item, using its smallest size for the thumbnail.
 * @param asset Stored asset from the endpoint.
 * @returns The list item.
 */
function toItem(asset: StoredAsset): MediaItem {
  const smallest = [...asset.variants].sort((a, b) => a.width - b.width)[0];
  return { id: asset.id, src: smallest ? `/media/${smallest.key}` : '', name: asset.originalName };
}

/**
 * Upload, browse and delete for the image library.
 * @param props Assets, strings and error messages.
 */
export default function MediaLibrary(props: MediaLibraryProps) {
  const { labels, errors } = props;
  const [assets, setAssets] = useState(props.assets);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState('');

  /**
   * Resizes and uploads every chosen file, one after another, so a slow connection shows steady progress.
   * @param files Files from the file input.
   */
  async function upload(files: File[]) {
    setMessage('');
    for (const [index, file] of files.entries()) {
      setProgress({ done: index, total: files.length });
      try {
        const image = await resizeImage(file);
        const form = new FormData();
        form.set('originalName', file.name.slice(0, 200) || 'image');
        form.set('width', String(image.width));
        form.set('height', String(image.height));
        for (const size of image.sizes) {
          const extension = size.blob.type === 'image/webp' ? 'webp' : 'jpg';
          form.set(`size-${size.width}`, size.blob, `${size.width}.${extension}`);
        }
        const result = await postForm<StoredAsset>('/api/admin/media', form);
        if (result.ok) setAssets((current) => [toItem(result.data), ...current]);
        else setMessage(errors[result.code] ?? errors.generic ?? '');
      } catch {
        setMessage(labels.media.failed);
      }
    }
    setProgress(null);
  }

  /**
   * Deletes an image that no product or category uses.
   * @param item Image to delete.
   */
  async function remove(item: MediaItem) {
    if (!window.confirm(labels.media.confirmDelete)) return;
    const result = await postJson('/api/admin/media/delete', { id: item.id });
    if (result.ok) setAssets((current) => current.filter((asset) => asset.id !== item.id));
    else setMessage(errors[result.code] ?? errors.generic ?? '');
  }

  /**
   * Reloads the library from the endpoint, for example after another tab uploaded.
   */
  async function refresh() {
    const result = await getJson<{ items: StoredAsset[] }>('/api/admin/media?pageSize=100');
    if (result.ok) setAssets(result.data.items.map(toItem));
  }

  return (
    <div class="flex flex-col gap-6">
      <section class={`${PANEL} items-start`} aria-labelledby="upload-title">
        <h2 id="upload-title" class="text-lg font-semibold">
          {labels.media.upload}
        </h2>
        <p class="text-text/70 text-sm">{labels.media.hint}</p>
        <label class={`${BUTTON} cursor-pointer`}>
          {labels.media.choose}
          <input
            type="file"
            class="sr-only"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => {
              const input = event.currentTarget;
              const files = Array.from(input.files ?? []);
              input.value = '';
              if (files.length > 0) void upload(files);
            }}
          />
        </label>
        {progress && (
          <p role="status" class="text-sm">
            {labels.media.uploading
              .replace('{done}', String(progress.done + 1))
              .replace('{total}', String(progress.total))}
          </p>
        )}
        {message && (
          <p role="alert" class={ERROR_TEXT}>
            {message}
          </p>
        )}
      </section>

      {assets.length === 0 && <p class="text-text/70 text-sm">{labels.media.empty}</p>}
      <ul class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {assets.map((item) => (
          <li class="rounded-brand bg-surface flex flex-col gap-2 overflow-hidden p-2">
            {item.src && (
              <img
                src={item.src}
                alt={item.name}
                loading="lazy"
                class="aspect-square w-full rounded object-cover"
              />
            )}
            <span class="truncate text-xs">{item.name}</span>
            <button type="button" class={LINK_BUTTON} onClick={() => remove(item)}>
              {labels.media.delete}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" class={LINK_BUTTON} onClick={() => void refresh()}>
        {labels.media.refresh}
      </button>
    </div>
  );
}
