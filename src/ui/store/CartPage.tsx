// Cart page (Preact island). Every change is re-quoted by the server; the totals and notices come from that quote.
// Lines the server cannot sell are removed from the cart and the customer is told why.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { CartQuote } from '@/application/cart/quote-cart';
import type { CurrencyCode } from '@/domain/shared/currency';
import { formatMoney } from '@/domain/shared/format';
import type { Locale } from '@/domain/shared/locale';
import { money } from '@/domain/shared/money';
import { cartLines, removeFromCart, replaceCartLines, setCartQuantity, type CartLine } from '../stores/cart';

/** Props of the cart page. Labels are translated on the server. */
export interface CartPageProps {
  locale: Locale;
  currency: CurrencyCode;
  country: string;
  checkoutHref: string;
  taxLabel: string;
  labels: {
    title: string;
    empty: string;
    subtotal: string;
    tax: string;
    total: string;
    checkout: string;
    continueShopping: string;
    remove: string;
    quantity: string;
    priceUpdated: string;
    quantityAdjusted: string;
    unavailable: string;
    shippingNote: string;
    loadError: string;
  };
  continueHref: string;
}

/** Stable text for a set of lines, used to skip re-quoting an unchanged cart. */
function keyOf(lines: CartLine[]): string {
  return lines.map((line) => `${line.variantId}:${line.quantity}:${line.unitPriceMinor}`).join('|');
}

/**
 * Cart page with server-quoted totals.
 * @param props Locale, currency, links and translated labels.
 */
export default function CartPage(props: CartPageProps) {
  const lines = useStore(cartLines);
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastQuoted = useRef('');
  const key = keyOf(lines);

  useEffect(() => {
    if (lines.length === 0) {
      setQuote(null);
      setNotices([]);
      return;
    }
    if (key === lastQuoted.current) return;

    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetch('/api/cart/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        locale: props.locale,
        items: lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
        })),
      }),
    })
      .then((response) => response.json() as Promise<{ ok: boolean; data?: CartQuote }>)
      .then((body) => {
        if (cancelled) return;
        if (!body.ok || !body.data) {
          setFailed(true);
          setLoading(false);
          return;
        }
        const data = body.data;
        const messages: string[] = [];
        const next: CartLine[] = [];
        for (const line of data.lines) {
          const before = lines.find((item) => item.variantId === line.variantId);
          if (!line.available) {
            messages.push(props.labels.unavailable.replace('{name}', before?.name ?? ''));
            continue;
          }
          if (line.flags.priceChanged) messages.push(props.labels.priceUpdated.replace('{name}', line.name));
          if (line.flags.quantityAdjusted) {
            messages.push(props.labels.quantityAdjusted.replace('{name}', line.name));
          }
          next.push({
            variantId: line.variantId,
            productId: line.productId,
            name: line.name,
            variantLabel: line.variantLabel,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            compareAtPriceMinor: line.compareAtPriceMinor,
            productPath: before?.productPath ?? '',
          });
        }
        lastQuoted.current = keyOf(next);
        replaceCartLines(next);
        setQuote(data);
        setNotices(messages);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const fmt = (amount: number) => formatMoney(money(amount, props.currency), props.locale, props.country);

  if (lines.length === 0) {
    return (
      <div class="flex flex-col items-center gap-6 py-20 text-center">
        <p class="font-display text-2xl font-semibold tracking-tight md:text-2xl">{props.labels.empty}</p>
        <a
          href={props.continueHref}
          class="bg-primary text-on-primary inline-flex min-h-12 items-center rounded-full px-7 font-medium transition hover:opacity-90"
        >
          {props.labels.continueShopping}
        </a>
      </div>
    );
  }

  return (
    <div class="grid gap-8 md:grid-cols-[1fr_20rem]">
      <section class="flex flex-col gap-4" aria-label={props.labels.title}>
        {notices.length > 0 && (
          <ul class="rounded-brand flex flex-col gap-2 bg-amber-50 p-3 text-sm text-amber-900" role="status">
            {notices.map((notice) => (
              <li>{notice}</li>
            ))}
          </ul>
        )}
        {failed && <p class="text-accent text-sm">{props.labels.loadError}</p>}
        <ul class="flex flex-col gap-4">
          {lines.map((line) => (
            <li class="border-text/10 flex gap-3 border-b pb-4">
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <p class="font-medium">{line.name}</p>
                {line.variantLabel && <p class="text-text/70 text-sm">{line.variantLabel}</p>}
                <p class="text-sm">{fmt(line.unitPriceMinor)}</p>
              </div>
              <div class="flex flex-col items-end gap-2">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="border-text/20 hover:border-text min-h-11 min-w-11 rounded-full border transition-colors"
                    aria-label="−"
                    onClick={() => setCartQuantity(line.variantId, line.quantity - 1)}
                  >
                    −
                  </button>
                  <output class="min-w-8 text-center" aria-label={props.labels.quantity}>
                    {line.quantity}
                  </output>
                  <button
                    type="button"
                    class="border-text/20 hover:border-text min-h-11 min-w-11 rounded-full border transition-colors"
                    aria-label="+"
                    onClick={() => setCartQuantity(line.variantId, line.quantity + 1)}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  class="min-h-11 text-sm underline"
                  onClick={() => removeFromCart(line.variantId)}
                >
                  {props.labels.remove}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <aside
        class="rounded-card bg-surface flex h-fit flex-col gap-4 p-6 md:sticky md:top-28"
        aria-label={props.labels.total}
      >
        <p class="flex justify-between text-sm">
          <span>{props.labels.subtotal}</span>
          <span>{quote ? fmt(quote.totals.subtotalMinor) : '…'}</span>
        </p>
        <p class="flex justify-between text-sm">
          <span>
            {props.labels.tax} {props.taxLabel}
          </span>
          <span>{quote ? fmt(quote.totals.taxMinor) : '…'}</span>
        </p>
        <p class="text-text/70 text-xs">{props.labels.shippingNote}</p>
        <p class="border-text/10 flex justify-between border-t pt-3 text-base font-semibold">
          <span>{props.labels.total}</span>
          <span>{quote ? fmt(quote.totals.totalMinor) : '…'}</span>
        </p>
        <a
          href={props.checkoutHref}
          aria-disabled={loading || failed ? 'true' : undefined}
          class="rounded-brand bg-primary text-on-primary inline-flex min-h-14 items-center justify-center text-base font-semibold transition hover:opacity-90"
        >
          {props.labels.checkout}
        </a>
        <a href={props.continueHref} class="text-center text-sm underline">
          {props.labels.continueShopping}
        </a>
      </aside>
    </div>
  );
}
