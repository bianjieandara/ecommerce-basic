// Shipping methods of the store: one card per method, then the card that adds one. Each card saves on its own.
import type { FieldDescriptor } from '@/application/forms/field-descriptor';
import type { ShippingMethodRecord } from '@/application/ports/ordering';
import type { Locale } from '@/domain/shared/locale';
import ShippingCard, { type ShippingLabels } from './ShippingCard';

/** Props of the shipping manager. */
export interface ShippingManagerProps {
  methods: ShippingMethodRecord[];
  locale: Locale;
  /** Minor-unit digits of the store currency. */
  exponent: number;
  /** Position a new method gets, after the last one. */
  nextPosition: number;
  fields: FieldDescriptor[];
  labels: ShippingLabels & { hint: string; empty: string };
  errorTexts: Record<string, string>;
}

/**
 * The list of methods with the card that adds one.
 * @param props Methods, fields, texts and the store currency.
 */
export default function ShippingManager(props: ShippingManagerProps) {
  const { methods, labels } = props;
  return (
    <div class="flex flex-col gap-6">
      <p class="text-text/70 text-sm">{labels.hint}</p>
      {methods.length === 0 && <p class="text-text/70 text-sm">{labels.empty}</p>}
      {methods.map((method) => (
        <ShippingCard
          key={method.id}
          method={method}
          nextPosition={props.nextPosition}
          exponent={props.exponent}
          locale={props.locale}
          fields={props.fields}
          labels={labels}
          errorTexts={props.errorTexts}
        />
      ))}
      <ShippingCard
        method={null}
        nextPosition={props.nextPosition}
        exponent={props.exponent}
        locale={props.locale}
        fields={props.fields}
        labels={labels}
        errorTexts={props.errorTexts}
      />
    </div>
  );
}
