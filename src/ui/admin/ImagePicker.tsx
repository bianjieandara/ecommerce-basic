// Product images: the chosen images in order (move, remove) and the library grid to add more from.
import { useState } from 'preact/hooks';
import { BUTTON, LINK_BUTTON, PANEL } from './lib/classes';
import type { MediaOption } from './catalog-options';
import type { AdminLabels } from './ProductFields';

/** Props of the image picker. */
export interface ImagePickerProps {
  selected: string[];
  media: MediaOption[];
  onChange: (ids: string[]) => void;
  labels: AdminLabels;
}

/**
 * Chooses and orders the images of a product from the library.
 * @param props Selected ids, the library and the strings.
 */
export default function ImagePicker(props: ImagePickerProps) {
  const { selected, media, onChange, labels } = props;
  const [open, setOpen] = useState(false);
  const byId = new Map(media.map((item) => [item.id, item]));

  /**
   * Moves one selected image up or down.
   * @param index Position of the image.
   * @param step -1 for up, 1 for down.
   */
  function move(index: number, step: -1 | 1) {
    const target = index + step;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target] as string, next[index] as string];
    onChange(next);
  }

  /**
   * Adds or removes an image of the library.
   * @param id Asset id.
   */
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  return (
    <section class={PANEL} aria-labelledby="images-title">
      <div class="flex items-center justify-between gap-3">
        <h2 id="images-title" class="text-lg font-semibold">
          {labels.product.images}
        </h2>
        <button type="button" class={LINK_BUTTON} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? labels.product.doneImages : labels.product.addImages}
        </button>
      </div>
      {selected.length === 0 && <p class="text-text/70 text-sm">{labels.product.imagesEmpty}</p>}
      <ol class="flex flex-col gap-2">
        {selected.map((id, index) => {
          const item = byId.get(id);
          return (
            <li class="rounded-brand border-text/15 flex items-center gap-3 border p-2">
              {item ? (
                <img
                  src={item.src}
                  alt=""
                  width={56}
                  height={56}
                  class="rounded-brand size-14 object-cover"
                />
              ) : (
                <span class="rounded-brand bg-text/10 size-14" aria-hidden="true" />
              )}
              <span class="min-w-0 flex-1 truncate text-sm">{item?.name ?? labels.product.imageMissing}</span>
              <button
                type="button"
                class={BUTTON}
                disabled={index === 0}
                aria-label={labels.product.moveUp}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                class={BUTTON}
                disabled={index === selected.length - 1}
                aria-label={labels.product.moveDown}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button type="button" class={LINK_BUTTON} onClick={() => toggle(id)}>
                {labels.product.remove}
              </button>
            </li>
          );
        })}
      </ol>
      {open && (
        <div class="grid grid-cols-3 gap-2 sm:grid-cols-5" role="group" aria-label={labels.product.addImages}>
          {media.map((item) => {
            const chosen = selected.includes(item.id);
            return (
              <button
                type="button"
                aria-pressed={chosen}
                class={`rounded-brand relative overflow-hidden border-2 ${chosen ? 'border-primary' : 'border-transparent'}`}
                onClick={() => toggle(item.id)}
              >
                <img
                  src={item.src}
                  alt={item.name}
                  loading="lazy"
                  class="aspect-square w-full object-cover"
                />
                {chosen && <span class="bg-primary absolute top-1 right-1 rounded px-1 text-xs">✓</span>}
              </button>
            );
          })}
          {media.length === 0 && <p class="text-text/70 col-span-full text-sm">{labels.media.empty}</p>}
        </div>
      )}
    </section>
  );
}
