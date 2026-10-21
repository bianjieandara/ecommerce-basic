// Checkout form (Preact island). The cart lives in the browser, so the form asks the server to price it, sends the
// customer's details and follows whatever step the server returns. The server checks everything again; the form only
// shows its answers.
import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { CartQuote } from '@/application/cart/quote-cart';
import type { PlacedOrder } from '@/application/ordering/place-order';
import type { PaymentMethod } from '@/application/ports/payments';
import type { CurrencyCode } from '@/domain/shared/currency';
import { formatMoney } from '@/domain/shared/format';
import type { Locale } from '@/domain/shared/locale';
import { money } from '@/domain/shared/money';
import { cartLines } from '../stores/cart';

/** Labels of the checkout form. Translated on the server; error labels are keyed by error code. */
export interface CheckoutLabels {
  contact: string;
  delivery: string;
  payment: string;
  summary: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  address2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  note: string;
  whatsappOptIn: string;
  placeOrder: string;
  placing: string;
  subtotal: string;
  tax: string;
  shipping: string;
  total: string;
  shippingPending: string;
  empty: string;
  continueShopping: string;
  quoteError: string;
  formError: string;
  methods: Record<PaymentMethod, string>;
  errors: Record<string, string>;
}

/** Props of the checkout form. */
export interface CheckoutFormProps {
  locale: Locale;
  currency: CurrencyCode;
  country: string;
  taxLabel: string;
  siteKey: string;
  cartHref: string;
  continueHref: string;
  labels: CheckoutLabels;
}

/**
 * Reads the attribution saved from the landing page (filled in Stage 19). Returns an empty object when none exists.
 * @returns Attribution fields.
 */
function readAttribution(): Record<string, string> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem('attribution') ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Turnstile token, once the widget has produced one.
 * @returns The token, or null.
 */
function turnstileToken(): string | null {
  const input = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
  return input?.value ? input.value : null;
}

/**
 * Sends the customer to the next step. Online methods go to the provider page. WhatsApp opens the chat in a new tab and
 * this tab shows the order. The manual methods go straight to the order page.
 * @param order Result of the checkout request.
 * @param chosen Payment method the customer picked.
 */
function goToNextStep(order: PlacedOrder, chosen: PaymentMethod): void {
  if (order.next.kind === 'redirect' && chosen !== 'whatsapp') {
    window.location.assign(order.next.url);
    return;
  }
  if (order.next.kind === 'redirect') window.open(order.next.url, '_blank', 'noopener');
  window.location.assign(order.orderPath);
}

/**
 * Checkout form with the server-priced summary.
 * @param props Locale, currency, links and translated labels.
 */
export default function CheckoutForm(props: CheckoutFormProps) {
  const { labels } = props;
  const lines = useStore(cartLines);
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [shippingId, setShippingId] = useState('');
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const key = `${lines.map((line) => `${line.variantId}:${line.quantity}:${line.unitPriceMinor}`).join('|')}#${shippingId}`;

  useEffect(() => {
    if (lines.length === 0) return;
    let cancelled = false;
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
        shippingMethodId: shippingId || undefined,
      }),
    })
      .then((response) => response.json() as Promise<{ ok: boolean; data?: CartQuote }>)
      .then((body) => {
        if (cancelled) return;
        const data = body.data;
        if (!body.ok || !data) {
          setQuoteFailed(true);
          return;
        }
        setQuote(data);
        setQuoteFailed(false);
        if (!shippingId && data.shippingOptions[0]) setShippingId(data.shippingOptions[0].id);
        setMethod((current) =>
          current && data.paymentMethods.includes(current) ? current : (data.paymentMethods[0] ?? ''),
        );
      })
      .catch(() => {
        if (!cancelled) setQuoteFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  /**
   * Places the order and moves on. The server answers with the next step or with the reason it refused.
   * @param event Form submit event.
   */
  async function submit(event: Event) {
    event.preventDefault();
    if (submitting || !quote || !method || !shippingId) return;
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const field = (name: string) => String(data.get(name) ?? '').trim();
    const selected = quote.shippingOptions.find((option) => option.id === shippingId);
    setSubmitting(true);
    setFormError('');
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locale: props.locale,
          items: lines.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
          })),
          customer: { name: field('name'), email: field('email'), phone: field('phone') },
          whatsappOptIn: data.get('whatsappOptIn') === 'on',
          shippingMethodId: shippingId,
          address:
            selected?.kind === 'flat'
              ? {
                  line1: field('line1'),
                  line2: field('line2'),
                  city: field('city'),
                  region: field('region'),
                  postalCode: field('postalCode'),
                  country: field('country'),
                }
              : null,
          paymentMethod: method,
          note: field('note'),
          attribution: readAttribution(),
          turnstileToken: turnstileToken(),
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        data?: PlacedOrder;
        error?: { code?: string };
      };
      if (!result.ok || !result.data) {
        setFormError(labels.errors[result.error?.code ?? ''] ?? labels.errors.generic ?? labels.formError);
        setSubmitting(false);
        return;
      }
      cartLines.set([]);
      goToNextStep(result.data, method);
    } catch {
      setFormError(labels.formError);
      setSubmitting(false);
    }
  }

  if (lines.length === 0) {
    return (
      <div class="flex flex-col items-center gap-4 py-12 text-center">
        <p class="text-lg font-semibold">{labels.empty}</p>
        <a
          href={props.continueHref}
          class="rounded-brand border-text/20 inline-flex min-h-11 items-center border px-4"
        >
          {labels.continueShopping}
        </a>
      </div>
    );
  }

  const fmt = (amount: number) => formatMoney(money(amount, props.currency), props.locale, props.country);
  const selected = quote?.shippingOptions.find((option) => option.id === shippingId);
  const needsAddress = selected?.kind === 'flat';
  const inputClass = 'rounded-brand border-text/20 min-h-11 w-full border bg-white px-3';

  return (
    <form class="grid gap-8 md:grid-cols-[1fr_20rem]" onSubmit={submit}>
      <div class="flex flex-col gap-8">
        <section class="flex flex-col gap-3" aria-labelledby="checkout-contact">
          <h2 id="checkout-contact" class="text-lg font-semibold">
            {labels.contact}
          </h2>
          <label class="flex flex-col gap-1 text-sm">
            {labels.name}
            <input name="name" autoComplete="name" required class={inputClass} />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            {labels.email}
            <input name="email" type="email" autoComplete="email" required class={inputClass} />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            {labels.phone}
            <input name="phone" type="tel" autoComplete="tel" required class={inputClass} />
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input name="whatsappOptIn" type="checkbox" />
            {labels.whatsappOptIn}
          </label>
        </section>

        <section class="flex flex-col gap-3" aria-labelledby="checkout-delivery">
          <h2 id="checkout-delivery" class="text-lg font-semibold">
            {labels.delivery}
          </h2>
          {quote?.shippingOptions.map((option) => (
            <label class="rounded-brand border-text/20 flex min-h-11 items-center justify-between gap-3 border p-3 text-sm">
              <span class="flex items-center gap-2">
                <input
                  type="radio"
                  name="shipping"
                  value={option.id}
                  checked={option.id === shippingId}
                  onChange={() => setShippingId(option.id)}
                />
                {option.name}
              </span>
              <span>{option.costMinor === 0 ? '—' : fmt(option.costMinor)}</span>
            </label>
          ))}
          {needsAddress && (
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="flex flex-col gap-1 text-sm sm:col-span-2">
                {labels.address}
                <input name="line1" autoComplete="address-line1" required class={inputClass} />
              </label>
              <label class="flex flex-col gap-1 text-sm">
                {labels.address2}
                <input name="line2" autoComplete="address-line2" class={inputClass} />
              </label>
              <label class="flex flex-col gap-1 text-sm">
                {labels.city}
                <input name="city" autoComplete="address-level2" required class={inputClass} />
              </label>
              <label class="flex flex-col gap-1 text-sm">
                {labels.region}
                <input name="region" autoComplete="address-level1" class={inputClass} />
              </label>
              <label class="flex flex-col gap-1 text-sm">
                {labels.postalCode}
                <input name="postalCode" autoComplete="postal-code" class={inputClass} />
              </label>
              <label class="flex flex-col gap-1 text-sm">
                {labels.countryCode}
                <input
                  name="country"
                  defaultValue={props.country}
                  minLength={2}
                  maxLength={2}
                  required
                  class={inputClass}
                />
              </label>
            </div>
          )}
          <label class="flex flex-col gap-1 text-sm">
            {labels.note}
            <textarea name="note" rows={3} maxLength={500} class={inputClass} />
          </label>
        </section>

        <section class="flex flex-col gap-3" aria-labelledby="checkout-payment">
          <h2 id="checkout-payment" class="text-lg font-semibold">
            {labels.payment}
          </h2>
          {quote?.paymentMethods.map((option) => (
            <label class="rounded-brand border-text/20 flex min-h-11 items-center gap-2 border p-3 text-sm">
              <input
                type="radio"
                name="payment"
                value={option}
                checked={option === method}
                onChange={() => setMethod(option)}
              />
              {labels.methods[option]}
            </label>
          ))}
        </section>

        {formError && (
          <p role="alert" class="text-accent text-sm">
            {formError}
          </p>
        )}
      </div>

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
          <span>{selected ? fmt(selected.costMinor) : labels.shippingPending}</span>
        </p>
        <p class="border-text/10 flex justify-between border-t pt-3 text-base font-semibold">
          <span>{labels.total}</span>
          <span>{quote && selected ? fmt(quote.totals.totalMinor) : '…'}</span>
        </p>
        <div class="cf-turnstile" data-sitekey={props.siteKey} />
        <button
          type="submit"
          disabled={submitting || !quote || !method || !shippingId}
          class="rounded-brand bg-primary text-on-primary inline-flex min-h-12 items-center justify-center font-semibold disabled:opacity-50"
        >
          {submitting ? labels.placing : labels.placeOrder}
        </button>
        {quoteFailed && <p class="text-accent text-sm">{labels.quoteError}</p>}
      </aside>
    </form>
  );
}
