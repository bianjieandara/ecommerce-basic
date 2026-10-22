// Marketing consent banner (Preact island). Asks once, stores the answer in the consent cookie and hides itself.
// Renders nothing on the server when the layout says no, and nothing in the browser once a choice exists.
import { useEffect, useState } from 'preact/hooks';
import {
  consentCookieString,
  consentCookieValue,
  parseConsent,
  serializeConsent,
} from '@/domain/consent/consent';

/** Copy for the banner, passed from the layout so the island holds no user-visible text. */
export interface ConsentBannerLabels {
  text: string;
  accept: string;
  refuse: string;
}

/** Props of the consent banner. */
export interface ConsentBannerProps {
  labels: ConsentBannerLabels;
  /** Server decision from `bannerRequired` for this request's cookies. The browser cookie is checked again on mount. */
  showInitially: boolean;
}

/**
 * Marketing consent banner. Both buttons have equal weight: a refusal must be as easy as an acceptance.
 * Motion is limited to a slide-in that only runs when the visitor has not asked for reduced motion.
 */
export default function ConsentBanner({ labels, showInitially }: ConsentBannerProps) {
  const [open, setOpen] = useState(showInitially);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (parseConsent(consentCookieValue(document.cookie)).marketing !== null) {
      setOpen(false);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  /** Stores the choice for a year and hides the banner. A browser that refuses cookies still hides it for this page view. */
  function choose(marketing: boolean) {
    document.cookie = consentCookieString(serializeConsent(marketing), location.protocol === 'https:');
    setOpen(false);
  }

  if (!open) return null;

  const buttonClass =
    'min-h-11 min-w-11 rounded border-2 border-text bg-background px-4 py-2 text-sm font-bold text-text';

  return (
    <div
      class={`border-text bg-surface fixed inset-x-0 bottom-0 z-50 border-t px-4 py-4 shadow-lg motion-safe:transition-transform motion-safe:duration-300 ${
        entered ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div class="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-text text-sm">{labels.text}</p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <button type="button" class={buttonClass} onClick={() => choose(false)}>
            {labels.refuse}
          </button>
          <button type="button" class={buttonClass} onClick={() => choose(true)}>
            {labels.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
