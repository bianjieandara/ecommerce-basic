// Shapes the attribute screens share: an attribute and its values as the page sends them, and the draft being edited.

/** One value of an attribute as the page sends it. */
export interface AttributeValueItem {
  id: string;
  code: string;
  label: { es?: string; en?: string };
  colorHex: string | null;
}

/** One attribute as the page sends it. */
export interface AttributeItem {
  id: string;
  code: string;
  name: { es?: string; en?: string };
  display: 'buttons' | 'swatches';
  isFilterable: boolean;
  values: AttributeValueItem[];
}

/** The attribute being edited; a null id means a new one. */
export interface AttributeDraft {
  id: string | null;
  code: string;
  name: { es: string; en: string };
  display: 'buttons' | 'swatches';
  isFilterable: boolean;
  values: AttributeValueItem[];
}

/**
 * A new value. Its id is assigned by the server on save, so the id stays empty here.
 * @returns An empty value.
 */
export function blankValue(): AttributeValueItem {
  return { id: '', code: '', label: { es: '', en: '' }, colorHex: null };
}
