// Header search (Preact island). A button opens a dialog with a search box; after two letters it lists matching products. Without
// JavaScript the header link still goes to the shop search, and pressing Enter here submits the same search form.
import { useEffect, useRef, useState } from 'preact/hooks';

/** Props of the search overlay. */
export interface SearchOverlayProps {
  locale: 'es' | 'en';
  /** Shop page the plain search form submits to. */
  shopHref: string;
  /** Translated texts (the server fills them, so the island never loads the dictionaries). */
  labels: { open: string; close: string; placeholder: string };
}

/** Pause after the last key before suggestions are requested, in milliseconds. */
const DEBOUNCE_MS = 250;
/** Shortest text that is searched, as the endpoint requires. */
const MIN_CHARS = 2;

/** One suggestion from the endpoint. */
interface Suggestion {
  name: string;
  href: string;
}

/**
 * The search button and its dialog.
 * @param props Locale, shop link and labels.
 */
export default function SearchOverlay(props: SearchOverlayProps) {
  const { labels } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);

  useEffect(() => {
    const term = text.trim();
    if (term.length < MIN_CHARS) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ locale: props.locale, q: term });
      fetch(`/api/search/suggest?${query}`)
        .then((response) => response.json() as Promise<{ ok: boolean; data?: { items: Suggestion[] } }>)
        .then((body) => {
          if (!cancelled) setItems(body.ok && body.data ? body.data.items : []);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  return (
    <>
      <button
        type="button"
        class="hover:bg-surface inline-flex min-h-11 min-w-11 items-center justify-center rounded-full"
        aria-label={labels.open}
        onClick={() => dialog.current?.showModal()}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        class="bg-background text-text m-0 mt-0 w-full max-w-none p-4 backdrop:bg-black/40 sm:mx-auto sm:mt-12 sm:max-w-lg sm:rounded-lg"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <form method="get" action={props.shopHref} class="flex items-center gap-2">
          <input
            type="search"
            name="q"
            value={text}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            autoComplete="off"
            class="rounded-brand border-text/20 min-h-11 w-full border bg-white px-3"
            onInput={(event) => setText(event.currentTarget.value)}
          />
          <button
            type="button"
            class="min-h-11 min-w-11 shrink-0"
            aria-label={labels.close}
            onClick={() => dialog.current?.close()}
          >
            ✕
          </button>
        </form>
        {items.length > 0 && (
          <ul class="mt-3 flex flex-col" role="listbox">
            {items.map((item) => (
              <li key={item.href}>
                <a href={item.href} class="hover:bg-surface flex min-h-11 items-center rounded px-2">
                  {item.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </dialog>
    </>
  );
}
