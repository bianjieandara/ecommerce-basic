// Marketing consent banner (Preact island). Asks once, stores the answer in the consent cookie and hides itself.
// The decision is made from the settings alone during server rendering, so cached HTML carries no visitor state;
// the browser reads the consent cookie on mount and hides the banner when a choice exists.
import { useEffect, useState } from 'preact/hooks';
import {
  bannerRequired,
  consentCookieString,
  consentCookieValue,
  parseConsent,
  serializeConsent,
  type ConsentBannerMode,
} from '@/domain/consent/consent';
import { CONSENT_CHANGE_EVENT } from '@/ui/lib/track';

/** Copy for the banner, passed from the layout so the island holds no user-visible text. */
export interface ConsentBannerLabels {
  /** Accessible name of the banner region; not shown. */
  title: string;
  text: string;
  accept: string;
  refuse: string;
}

/** Props of the consent banner. Only settings go in: the visitor's cookie is read in the browser. */
export interface ConsentBannerProps {
  labels: ConsentBannerLabels;
  /** The `consentBannerMode` setting. */
  mode: ConsentBannerMode;
  /** Whether a marketing tool is configured (see `isMarketingToolEnabled`). */
  marketingToolEnabled: boolean;
}

/**
 * Marketing consent banner. Both buttons have equal weight: a refusal must be as easy as an acceptance.
 * Motion is limited to a slide-in that only runs when the visitor has not asked for reduced motion.
 */
export default function ConsentBanner({ labels, mode, marketingToolEnabled }: ConsentBannerProps) {
  // Server render and first paint use "no choice yet": the same HTML is cached for every visitor of a page.
  const [open, setOpen] = useState(() => bannerRequired(mode, marketingToolEnabled, parseConsent(null)));
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const consent = parseConsent(consentCookieValue(document.cookie));
    if (!bannerRequired(mode, marketingToolEnabled, consent)) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [mode, marketingToolEnabled]);

  /** Stores the choice for a year and hides the banner. A browser that refuses cookies still hides it for this page view. */
  function choose(marketing: boolean) {
    document.cookie = consentCookieString(serializeConsent(marketing), location.protocol === 'https:');
    // Lets the tracking module load the Pixel now, without a reload, when the visitor grants marketing.
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
    setOpen(false);
  }

  if (!open) return null;

  const buttonClass =
    'min-h-11 min-w-11 rounded border-2 border-text bg-background px-4 py-2 text-sm font-bold text-text';

  return (
    // A named region (not a modal dialog): the page stays usable, so screen readers can reach the banner as a landmark.
    <div
      role="region"
      aria-label={labels.title}
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
