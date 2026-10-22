// Cloudflare Turnstile for islands. The widget is rendered explicitly into an element that Preact owns: the script's implicit
// render runs once at page load, and a widget inside an island can lose its frame when the island hydrates.
import { useEffect, useRef, useState } from 'preact/hooks';

/** The part of the Turnstile browser API the storefront uses. */
interface TurnstileApi {
  render(element: HTMLElement, options: { sitekey: string }): string;
  getResponse(widgetId: string): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    /** Set by the Turnstile script once it has loaded. */
    turnstile?: TurnstileApi;
  }
}

/** How long to wait for the Turnstile script, in milliseconds. */
const SCRIPT_TIMEOUT_MS = 10_000;

/** Interval between checks while the script loads, in milliseconds. */
const POLL_MS = 100;

/**
 * Renders a widget into an element once the Turnstile script is available.
 * @param element Empty element the widget is rendered into.
 * @param siteKey Public Turnstile site key.
 * @returns The widget id, or null when the script did not load in time.
 */
async function renderWidget(element: HTMLElement, siteKey: string): Promise<string | null> {
  const started = Date.now();
  while (!window.turnstile) {
    if (Date.now() - started > SCRIPT_TIMEOUT_MS) return null;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return window.turnstile.render(element, { sitekey: siteKey });
}

/**
 * Renders the Turnstile widget of a form once the island is mounted, and gives the form its token.
 * @param siteKey Public Turnstile site key.
 * @returns The ref of the element the widget goes into, and the token and reset helpers.
 */
export function useTurnstile(siteKey: string) {
  // State, not a ref object: the effect runs when the container mounts, even when a form appears after its cart has loaded.
  const [element, setElement] = useState<HTMLElement | null>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!element) return;
    let active = true;
    void renderWidget(element, siteKey).then((id) => {
      if (active) widgetId.current = id;
      // The container went away while the script was loading: remove the widget that was just rendered.
      else if (id !== null) window.turnstile?.remove(id);
    });
    return () => {
      active = false;
      // A re-mounted form gets a fresh widget, so the old one is removed with its container.
      if (widgetId.current !== null) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [element, siteKey]);

  return {
    /** Callback ref of the element the widget is rendered into. */
    element: setElement,
    /** The token the visitor earned, or null while the check is not passed. */
    token(): string | null {
      if (widgetId.current === null || !window.turnstile) return null;
      return window.turnstile.getResponse(widgetId.current) || null;
    },
    /** Resets the widget, because a token can be verified only once. */
    reset(): void {
      if (widgetId.current !== null) window.turnstile?.reset(widgetId.current);
    },
  };
}
