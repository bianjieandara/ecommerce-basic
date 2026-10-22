// "See N results" button of the filter panel. It asks the count endpoint again after the shopper changes a filter, so the
// number is always the one the listing will show. Without JavaScript the button still submits the form.
import { useEffect, useState } from 'preact/hooks';

/** Props of the results button. */
export interface FilterResultsButtonProps {
  /** Id of the filter form this button belongs to. */
  formId: string;
  locale: 'es' | 'en';
  /** Category slug of a category page, or null on the index page. */
  category: string | null;
  /** Count rendered by the server with the page. */
  initialCount: number;
  /** Button text with a `{count}` placeholder. */
  labelTemplate: string;
}

/** Pause after the last change before the count is requested, in milliseconds. */
const DEBOUNCE_MS = 300;

/**
 * Builds the count request from the filter form. Empty fields are left out, as they are left out of the listing URL.
 * @param form Filter form.
 * @param props Locale and category of the page.
 * @returns Query string for the count endpoint.
 */
function countQuery(form: HTMLFormElement, props: FilterResultsButtonProps): string {
  const params = new URLSearchParams({ locale: props.locale });
  if (props.category) params.set('category', props.category);
  new FormData(form).forEach((value, key) => {
    if (typeof value === 'string' && value !== '') params.append(key, value);
  });
  return params.toString();
}

/**
 * Submit button that shows the number of products the current filters return.
 * @param props Form id, page locale and category, the server count and the label.
 */
export default function FilterResultsButton(props: FilterResultsButtonProps) {
  const [count, setCount] = useState(props.initialCount);

  useEffect(() => {
    const form = document.getElementById(props.formId);
    if (!(form instanceof HTMLFormElement)) return;
    let timer: number | undefined;
    // Only the newest request may update the button, so a slow answer never overwrites a fresher one.
    let latest = 0;

    const refresh = async () => {
      const id = ++latest;
      try {
        const response = await fetch(`/api/catalog/count?${countQuery(form, props)}`);
        if (!response.ok) return;
        const result = (await response.json()) as { ok: boolean; data?: { count: number } };
        if (result.ok && result.data && id === latest) setCount(result.data.count);
      } catch {
        // Keep the last count: the button still submits the form, which shows the real listing.
      }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, DEBOUNCE_MS);
    };

    form.addEventListener('input', schedule);
    form.addEventListener('change', schedule);
    return () => {
      window.clearTimeout(timer);
      form.removeEventListener('input', schedule);
      form.removeEventListener('change', schedule);
    };
  }, [props.formId, props.locale, props.category]);

  return (
    <button
      type="submit"
      aria-live="polite"
      class="rounded-brand bg-primary text-on-primary min-h-11 px-4 font-semibold"
    >
      {props.labelTemplate.replace('{count}', String(count))}
    </button>
  );
}
