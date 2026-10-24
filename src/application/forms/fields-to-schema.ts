// Builds zod validation schemas from field descriptors. The same schema validates admin forms on the client
// (for error messages) and on the server (for safety), so the rules can never drift apart.
import { z } from 'zod';
import type { Locale } from '@/domain/shared/locale';
import { isSafeHref } from '@/domain/shared/validators';
import type { FieldDescriptor } from './field-descriptor';

/** Options that change how required localized fields are checked. */
export interface SchemaOptions {
  /** Only this language is required for localized fields; the other may be empty. */
  defaultLocale: Locale;
}

/** Longest text accepted when a field declares no max. */
const DEFAULT_MAX_TEXT = 2000;

/** Refusal of a choice that is not one of the field's options. */
const UNKNOWN_OPTION = { message: 'Unknown option', params: { code: 'UNKNOWN_OPTION' } };

/**
 * One refused field as a use case returns it. `code` is the translation key the UI shows; `message` is English, for the logs.
 */
export interface FieldIssue {
  path: string;
  code: string;
  message: string;
}

/**
 * Reads the display code of a zod issue. Checks declare their code in `params`; built-in checks (min, regex, enum) have none
 * and map to the generic code, which the UI shows as its plain "invalid" text.
 * @param issue Issue from a zod parse.
 * @returns The display code.
 */
export function issueCode(issue: z.core.$ZodIssue): string {
  const params = 'params' in issue ? (issue.params as { code?: unknown } | undefined) : undefined;
  return typeof params?.code === 'string' ? params.code : 'INVALID';
}

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
      return field.nullable ? number.nullable() : number;
    }
    case 'boolean':
      return z.boolean();
    case 'select': {
      const allowed = field.options.map((option) => option.value);
      const choice = z.string().refine((value) => allowed.includes(value), UNKNOWN_OPTION);
      return field.nullable ? choice.nullable() : choice;
    }
    case 'object':
      return fieldsToSchema(field.fields, options);
    case 'multiselect': {
      const allowed = field.options.map((option) => option.value);
      return z.array(z.string().refine((value) => allowed.includes(value), UNKNOWN_OPTION));
    }
    case 'image':
      return z.uuid().nullable();
    case 'images':
    case 'productIds':
    case 'categoryIds':
      return z.array(z.uuid()).max(field.max ?? 50);
    case 'link':
      return z.object({
        href: z.string().refine(isSafeHref, {
          message: 'Use /, https:// or mailto:',
          params: { code: 'LINK_HREF' },
        }),
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
