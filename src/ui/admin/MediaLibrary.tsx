// Media library: upload photos (resized in the browser first), browse the library, and delete what nothing uses.
import { useState } from 'preact/hooks';
import { getJson, postForm, postJson } from './lib/api-client';
import { BUTTON, BUTTON_PRIMARY, CARD, ERROR_TEXT, FIELD, LABEL, PANEL } from './lib/classes';
import { resizeImage } from './lib/image-processing';
import type { AdminLabels } from './ProductFields';

/** One image of the library as the page shows it. */
export interface MediaItem {
  id: string;
  src: string;
  name: string;
  /** Alternative text per language; empty when none was written. */
  alt: { es: string; en: string };
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
  return {
    id: asset.id,
    src: smallest ? `/media/${smallest.key}` : '',
    name: asset.originalName,
    alt: { es: '', en: '' },
  };
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = assets.find((asset) => asset.id === selectedId) ?? null;
  const [altDraft, setAltDraft] = useState({ es: '', en: '' });
  const [altState, setAltState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  /**
   * Opens an image in the side panel, with its alternative text ready to edit.
   * @param item The image chosen.
   */
  function select(item: MediaItem) {
    setSelectedId(item.id);
    setAltDraft(item.alt);
    setAltState('idle');
  }

  /**
   * Saves the alternative text of the open image and keeps it in the list.
   */
  async function saveAlt() {
    if (!selected) return;
    setAltState('saving');
    const result = await postJson('/api/admin/media/alt', { id: selected.id, alt: altDraft });
    if (!result.ok) {
      setAltState('failed');
      setMessage(errors[result.code] ?? errors.generic ?? '');
      return;
    }
    const stored = { es: altDraft.es.trim(), en: altDraft.en.trim() };
    setAssets((current) =>
      current.map((asset) => (asset.id === selected.id ? { ...asset, alt: stored } : asset)),
    );
    setAltDraft(stored);
    setAltState('saved');
  }

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
    if (result.ok) {
      setAssets((current) => current.filter((asset) => asset.id !== item.id));
      setSelectedId(null);
    } else setMessage(errors[result.code] ?? errors.generic ?? '');
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
      <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {assets.map((item) => (
            <li>
              <button
                type="button"
                class={`${CARD} hover:border-text/40 aria-[current=true]:border-text block w-full overflow-hidden p-2 text-left transition-colors`}
                aria-current={item.id === selectedId ? 'true' : undefined}
                onClick={() => select(item)}
              >
                {item.src && (
                  <img
                    src={item.src}
                    alt={item.name}
                    loading="lazy"
                    class="aspect-square w-full rounded-xl object-cover"
                  />
                )}
                <span class="mt-2 block truncate text-xs">{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <aside class={`${CARD} flex flex-col gap-4 p-5 lg:sticky lg:top-24`} aria-live="polite">
          {selected ? (
            <>
              {selected.src && (
                <img
                  src={selected.src}
                  alt={selected.name}
                  class="rounded-card bg-surface aspect-square w-full object-cover"
                />
              )}
              <p class="font-semibold break-all">{selected.name}</p>
              <p class="text-text/70 text-sm">{labels.media.altHelp}</p>
              {(['es', 'en'] as const).map((language) => (
                <label class={LABEL}>
                  {labels.media.altLabel} ({language.toUpperCase()})
                  <input
                    class={FIELD}
                    maxLength={200}
                    value={altDraft[language]}
                    onInput={(event) => {
                      setAltDraft({ ...altDraft, [language]: event.currentTarget.value });
                      setAltState('idle');
                    }}
                  />
                </label>
              ))}
              <button
                type="button"
                class={BUTTON_PRIMARY}
                disabled={altState === 'saving'}
                onClick={() => void saveAlt()}
              >
                {altState === 'saving' ? labels.common.submitting : labels.media.altSave}
              </button>
              {altState === 'saved' && (
                <p role="status" class="text-sm">
                  {labels.media.altSaved}
                </p>
              )}
              <button type="button" class={BUTTON} onClick={() => remove(selected)}>
                {labels.media.delete}
              </button>
            </>
          ) : (
            <p class="text-text/70 text-sm">{labels.media.selectHint}</p>
          )}
        </aside>
      </div>
      <button type="button" class={BUTTON} onClick={() => void refresh()}>
        {labels.media.refresh}
      </button>
    </div>
  );
}
