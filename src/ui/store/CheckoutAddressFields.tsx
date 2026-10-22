// Delivery address fields of the checkout form. Shown only for shipping methods that deliver to an address.
import type { CheckoutLabels } from './checkout-support';

/** Props of the address fields. */
export interface CheckoutAddressFieldsProps {
  labels: CheckoutLabels;
  /** Two-letter country code the field starts with (the store's country). */
  country: string;
  /** Classes of every text input, shared with the rest of the form. */
  inputClass: string;
}

/**
 * The address inputs, named as the checkout request reads them.
 * @param props Labels, default country and the shared input classes.
 */
export function CheckoutAddressFields(props: CheckoutAddressFieldsProps) {
  const { labels, inputClass } = props;
  return (
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
  );
}
