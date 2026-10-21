// Builds zod validation schemas from field descriptors. The same schema validates admin forms on the client
// (for error messages) and on the server (for safety), so the rules can never drift apart.
import { z } from 'zod';
import type { Locale } from '@/domain/shared/locale';
import type { FieldDescriptor } from './field-descriptor';

/** Options that change how required localized fields are checked. */
export interface SchemaOptions {
  /** Only this language is required for localized fields; the other may be empty. */
  defaultLocale: Locale;
}

/** Longest text accepted when a field declares no max. */
const DEFAULT_MAX_TEXT = 2000;

/**
 * Builds the zod schema for one field.
 * @param field Field descriptor.
 * @param options Schema options (default language).
 * @returns The zod type for the field's value.
 */
function fieldSchema(field: FieldDescriptor, options: SchemaOptions): z.ZodType {
  switch (field.kind) {
    case 'text':
    case 'textarea':
    case 'url':
    case 'email':
    case 'tel':
    case 'color': {
      const base = z.string().max(field.max ?? DEFAULT_MAX_TEXT);
      return field.required ? base.min(1) : base;
    }
    case 'localizedText':
    case 'localizedTextarea':
    case 'localizedMarkdown': {
      const max = field.max ?? DEFAULT_MAX_TEXT;
      const required = field.required === true;
      const es =
        required && options.defaultLocale === 'es' ? z.string().min(1).max(max) : z.string().max(max);
      const en =
        required && options.defaultLocale === 'en' ? z.string().min(1).max(max) : z.string().max(max);
      return z.object({ es, en });
    }
    case 'number': {
      let number = z.number();
      if (field.min !== undefined) number = number.min(field.min);
      if (field.max !== undefined) number = number.max(field.max);
      return number;
    }
    case 'boolean':
      return z.boolean();
    case 'select': {
      const allowed = field.options.map((option) => option.value);
      return z.string().refine((value) => allowed.includes(value), 'Unknown option');
    }
    case 'multiselect': {
      const allowed = field.options.map((option) => option.value);
      return z.array(z.string().refine((value) => allowed.includes(value), 'Unknown option'));
    }
    case 'image':
      return z.uuid().nullable();
    case 'images':
    case 'productIds':
    case 'categoryIds':
      return z.array(z.uuid()).max(field.max ?? 50);
    case 'link':
      return z.object({
        href: z
          .string()
          .refine((value) => value.startsWith('/') || value.startsWith('https://'), 'Use / or https://'),
        label: z.object({ es: z.string().max(200), en: z.string().max(200) }),
      });
    case 'repeater': {
      const item = fieldsToSchema(field.fields, options);
      let list = z.array(item);
      if (field.min !== undefined) list = list.min(field.min);
      if (field.max !== undefined) list = list.max(field.max);
      return list;
    }
  }
}

/**
 * Builds a zod object schema for a list of fields, keyed by field name.
 * @param fields Field descriptors.
 * @param options Schema options (default language).
 * @returns An object schema for validating the whole form.
 */
export function fieldsToSchema(
  fields: FieldDescriptor[],
  options: SchemaOptions,
): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) shape[field.name] = fieldSchema(field, options);
  return z.object(shape);
}
