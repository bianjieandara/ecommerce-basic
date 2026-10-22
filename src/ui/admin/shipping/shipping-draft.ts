// Draft of one shipping method in the admin: prices are typed in major units and sent as minor units. A price that does not parse
// is sent as null, so the server refuses it with the field's path instead of the screen re-checking the rule.
import type { ShippingMethodRecord } from '@/application/ports/ordering';
import type { ShippingKind } from '@/domain/ordering/shipping';
import type { LocalizedText } from '@/domain/shared/localized-text';
import { majorTextFromMinor, minorFromMajorText } from '@/domain/shared/money';

/** What one card edits. A new method has no id. */
export type ShippingDraft = {
  id: string | null;
  kind: ShippingKind;
  name: LocalizedText;
  description: LocalizedText;
  /** Price typed in major units, such as "4.50". */
  price: string;
  /** Threshold typed in major units; empty when the method is never waived. */
  freeOver: string;
  isActive: boolean;
  position: number;
};

/**
 * Starting draft of a card.
 * @param method The stored method, or null for the card that adds one.
 * @param nextPosition Position a new method gets (after the last one).
 * @param exponent Minor-unit digits of the store currency.
 * @returns The draft.
 */
export function draftOf(
  method: ShippingMethodRecord | null,
  nextPosition: number,
  exponent: number,
): ShippingDraft {
  if (!method) {
    return {
      id: null,
      kind: 'flat',
      name: { es: '', en: '' },
      description: { es: '', en: '' },
      price: '',
      freeOver: '',
      isActive: true,
      position: nextPosition,
    };
  }
  return {
    id: method.id,
    kind: method.kind,
    name: method.name,
    description: method.description,
    price: majorTextFromMinor(method.priceMinor, exponent),
    freeOver: method.freeOverMinor === null ? '' : majorTextFromMinor(method.freeOverMinor, exponent),
    isActive: method.isActive,
    position: method.position,
  };
}

/**
 * Body of the save request. A pickup sends no price and no threshold, the same rule the use case applies.
 * @param draft What the card holds.
 * @param exponent Minor-unit digits of the store currency.
 * @returns The request body.
 */
export function requestOf(draft: ShippingDraft, exponent: number): Record<string, unknown> {
  const pickup = draft.kind === 'pickup';
  const freeOver = draft.freeOver.trim();
  return {
    ...(draft.id ? { id: draft.id } : {}),
    kind: draft.kind,
    name: draft.name,
    description: draft.description,
    priceMinor: pickup ? 0 : minorFromMajorText(draft.price, exponent),
    freeOverMinor: pickup || freeOver === '' ? null : minorFromMajorText(freeOver, exponent),
    isActive: draft.isActive,
    position: draft.position,
  };
}
