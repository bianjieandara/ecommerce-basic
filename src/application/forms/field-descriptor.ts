// Field descriptors: one definition per field, used to build the admin forms AND the validation schemas.
// Widgets and settings groups declare their fields with this type, so no form is hand-written twice.
import type { LocalizedText } from '@/domain/shared/localized-text';

/** A choice offered by a select or multiselect field. */
export interface FieldOption {
  value: string;
  label: LocalizedText;
}

/** Fields that hold one plain string. */
interface TextField {
  name: string;
  kind: 'text' | 'textarea' | 'url' | 'email' | 'tel' | 'color';
  label: LocalizedText;
  required?: boolean;
  max?: number;
}

/** Fields that hold one string per language. */
interface LocalizedField {
  name: string;
  kind: 'localizedText' | 'localizedTextarea' | 'localizedMarkdown';
  label: LocalizedText;
  required?: boolean;
  max?: number;
}

/** Numeric field with optional bounds. `nullable` lets the form send an empty value as null. */
interface NumberField {
  name: string;
  kind: 'number';
  label: LocalizedText;
  min?: number;
  max?: number;
  step?: number;
  nullable?: boolean;
}

/** Field descriptor for every supported form control. */
export type FieldDescriptor =
  | TextField
  | LocalizedField
  | NumberField
  | { name: string; kind: 'boolean'; label: LocalizedText }
  | {
      name: string;
      kind: 'select' | 'multiselect';
      label: LocalizedText;
      options: FieldOption[];
      nullable?: boolean;
    }
  /** A group of fields stored as one object, such as the social links of the contact settings. */
  | { name: string; kind: 'object'; label: LocalizedText; fields: FieldDescriptor[] }
  | { name: string; kind: 'image'; label: LocalizedText }
  | { name: string; kind: 'images' | 'productIds' | 'categoryIds'; label: LocalizedText; max?: number }
  | { name: string; kind: 'link'; label: LocalizedText }
  | {
      name: string;
      kind: 'repeater';
      label: LocalizedText;
      fields: FieldDescriptor[];
      min?: number;
      max?: number;
    };
