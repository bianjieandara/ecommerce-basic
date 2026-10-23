// Cart drawer (Preact island): a quick view of the cart that opens after an add. Prices here are the browser's copy;
// the cart page shows the server-quoted totals.
import { useEffect, useRef } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { formatMoney } from '@/domain/shared/format';
import { money } from '@/domain/shared/money';
import type { CurrencyCode } from '@/domain/shared/currency';
import type { Locale } from '@/domain/shared/locale';
import { cartLines, cartOpen, cartSubtotalMinor, removeFromCart } from '../stores/cart';

/** Props of the drawer. Labels are translated on the server. */
export interface CartDrawerProps {
  locale: Locale;
  currency: CurrencyCode;
  country: string;
  cartHref: string;
  labels: { title: string; empty: string; subtotal: string; remove: string; viewCart: string; close: string };
}

/**
 * Native dialog that shows the cart lines and opens when `cartOpen` becomes true.
 * @param props Locale, currency and translated labels.
 */
export default function CartDrawer(props: CartDrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = useStore(cartOpen);
  const lines = useStore(cartLines);
  const subtotal = useStore(cartSubtotalMinor);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      onClose={() => cartOpen.set(false)}
      onClick={(event) => {
        if (event.target === dialog.current) cartOpen.set(false);
      }}
      class="bg-background text-text backdrop:bg-text/40 m-0 h-[85dvh] w-full max-w-none rounded-t-2xl p-0 md:h-dvh md:max-w-md md:rounded-none"
      aria-labelledby="cart-drawer-title"
    >
      <div class="flex h-full flex-col">
        <header class="border-text/10 flex items-center justify-between border-b px-4 py-3">
          <h2 id="cart-drawer-title" class="text-lg font-semibold">
            {props.labels.title}
          </h2>
          <button
            type="button"
            class="min-h-11 min-w-11 rounded-full text-xl"
            aria-label={props.labels.close}
            onClick={() => cartOpen.set(false)}
          >
            ×
          </button>
        </header>
        <div class="flex-1 overflow-y-auto px-4 py-4">
          {lines.length === 0 ? (
            <p class="text-text/70 text-sm">{props.labels.empty}</p>
          ) : (
            <ul class="flex flex-col gap-4">
              {lines.map((line) => (
                <li class="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p class="font-medium">{line.name}</p>
                    {line.variantLabel && <p class="text-text/70">{line.variantLabel}</p>}
                    <p>
                      {line.quantity} ×{' '}
                      {formatMoney(money(line.unitPriceMinor, props.currency), props.locale, props.country)}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="min-h-11 underline"
                    onClick={() => removeFromCart(line.variantId)}
                  >
                    {props.labels.remove}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer class="border-text/10 flex flex-col gap-3 border-t px-4 py-3">
          <p class="flex justify-between text-sm font-semibold">
            <span>{props.labels.subtotal}</span>
            <span>{formatMoney(money(subtotal, props.currency), props.locale, props.country)}</span>
          </p>
          <a
            href={props.cartHref}
            class="rounded-brand bg-primary text-on-primary inline-flex min-h-12 items-center justify-center font-semibold"
          >
            {props.labels.viewCart}
          </a>
        </footer>
      </div>
    </dialog>
  );
}
