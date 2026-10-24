// Order summary of the checkout form: the cart lines, the server-priced totals, the bot check and the pay button.
import type { CartQuote } from '@/application/cart/quote-cart';
import type { CartLine } from '../stores/cart';
import type { CheckoutLabels } from './checkout-support';

/** Props of the summary. */
export interface CheckoutSummaryProps {
  labels: CheckoutLabels;
  lines: CartLine[];
  /** Server prices; null until the first answer arrives. */
  quote: CartQuote | null;
  /** The chosen shipping option, or undefined before one is chosen. */
  shipping: { costMinor: number } | undefined;
  /** Formats an amount in minor units in the store currency. */
  fmt: (amountMinor: number) => string;
  taxLabel: string;
  /** Ref callback of the bot check: the form renders the Turnstile widget into the element it attaches to. */
  turnstileRef: (node: HTMLElement | null) => void;
  submitting: boolean;
  /** Whether the form has everything it needs to place the order. */
  canSubmit: boolean;
  quoteFailed: boolean;
}

/**
 * The summary column.
 * @param props Cart lines, quote, formatting and state of the form.
 */
export function CheckoutSummary(props: CheckoutSummaryProps) {
  const { labels, lines, quote, shipping, fmt } = props;
  return (
    <aside class="rounded-brand bg-surface flex h-fit flex-col gap-3 p-4" aria-label={labels.summary}>
      {lines.map((line) => (
        <p class="flex justify-between gap-3 text-sm">
          <span>
            {line.quantity} × {line.name}
          </span>
          <span>{fmt(line.unitPriceMinor * line.quantity)}</span>
        </p>
      ))}
      <p class="border-text/10 flex justify-between border-t pt-3 text-sm">
        <span>{labels.subtotal}</span>
        <span>{quote ? fmt(quote.totals.subtotalMinor) : '…'}</span>
      </p>
      <p class="flex justify-between text-sm">
        <span>
          {labels.tax} {props.taxLabel}
        </span>
        <span>{quote ? fmt(quote.totals.taxMinor) : '…'}</span>
      </p>
      <p class="flex justify-between text-sm">
        <span>{labels.shipping}</span>
        <span>
          {shipping
            ? shipping.costMinor === 0
              ? labels.shippingFree
              : fmt(shipping.costMinor)
            : labels.shippingPending}
        </span>
      </p>
      <p class="border-text/10 flex justify-between border-t pt-3 text-base font-semibold">
        <span>{labels.total}</span>
        <span>{quote && shipping ? fmt(quote.totals.totalMinor) : '…'}</span>
      </p>
      <div ref={props.turnstileRef} />
      <button
        type="submit"
        disabled={props.submitting || !props.canSubmit}
        class="rounded-brand bg-primary text-on-primary inline-flex min-h-12 items-center justify-center font-semibold disabled:opacity-50"
      >
        {props.submitting ? labels.placing : labels.placeOrder}
      </button>
      {props.quoteFailed && <p class="text-accent text-sm">{labels.quoteError}</p>}
    </aside>
  );
}
