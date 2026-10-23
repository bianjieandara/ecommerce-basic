// Header search (Preact island). A button opens a dialog with a search box; after two letters it lists matching products. Without
// JavaScript the header link still goes to the shop search, and pressing Enter here submits the same search form.
import { useEffect, useRef, useState } from 'preact/hooks';
import PreactIcon from '../components/PreactIcon';
import {
  SEARCH_BUTTON_CLASS,
  SEARCH_FIELD_CLASS,
  SEARCH_ICON_CLASS,
  SEARCH_INPUT_CLASS,
} from '@/ui/lib/search-field';

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
        <PreactIcon name="search" size={22} />
      </button>
      <dialog
        ref={dialog}
        class="bg-background text-text sm:rounded-card m-0 mt-0 w-full max-w-none p-4 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm sm:mx-auto sm:mt-16 sm:max-w-xl sm:p-5"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <form method="get" action={props.shopHref} class={SEARCH_FIELD_CLASS}>
          <PreactIcon name="search" size={20} class={SEARCH_ICON_CLASS} />
          <input
            type="search"
            name="q"
            value={text}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            autoComplete="off"
            class={SEARCH_INPUT_CLASS}
            onInput={(event) => setText(event.currentTarget.value)}
          />
          <button
            type="button"
            class={`${SEARCH_BUTTON_CLASS} bg-surface hover:bg-text hover:text-background`}
            aria-label={labels.close}
            onClick={() => dialog.current?.close()}
          >
            <PreactIcon name="close" size={18} />
          </button>
        </form>
        {items.length > 0 && (
          <ul class="mt-3 flex flex-col gap-0.5" role="listbox">
            {items.map((item) => (
              <li key={item.href}>
                <a href={item.href} class="hover:bg-surface flex min-h-12 items-center rounded-xl px-4">
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
