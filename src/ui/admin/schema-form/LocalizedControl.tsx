// One localized field of a schema form: an input per language, and under each one a button that fills the other language from it.
// The button fills only when the translation kept every placeholder, and nothing is saved until the form is saved.
import type { LocalizedText } from '@/domain/shared/localized-text';
import { SUPPORTED_LOCALES, type Locale } from '@/domain/shared/locale';
import TranslateButton from '@/ui/admin/ai/TranslateButton';
import { translateButtonLabels, translateTarget } from '@/ui/admin/ai/translate-ui';
import { FIELD, LABEL } from '@/ui/admin/lib/classes';

/** Props of a localized control. */
export interface LocalizedControlProps {
  label: string;
  /** Textarea for long text; a single line otherwise. */
  multiline: boolean;
  texts: Partial<LocalizedText>;
  /** Admin language, in which the button texts are shown. */
  locale: Locale;
  onChange: (texts: Partial<LocalizedText>) => void;
}

/**
 * Renders the language inputs of a localized field, each with its translate button.
 * @param props Label, texts, admin language and change handler.
 * @returns The fieldset.
 */
export default function LocalizedControl(props: LocalizedControlProps) {
  const { label, multiline, texts, locale, onChange } = props;
  const labels = translateButtonLabels(locale);

  return (
    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1 text-sm font-semibold">{label}</legend>
      {SUPPORTED_LOCALES.map((code) => {
        const target = translateTarget(code);
        const value = texts[code] ?? '';
        return (
          <div class="flex flex-col gap-1" key={code}>
            <label class={LABEL}>
              {code.toUpperCase()}
              {multiline ? (
                <textarea
                  rows={3}
                  class={FIELD}
                  value={value}
                  onInput={(event) => onChange({ ...texts, [code]: event.currentTarget.value })}
                />
              ) : (
                <input
                  class={FIELD}
                  value={value}
                  onInput={(event) => onChange({ ...texts, [code]: event.currentTarget.value })}
                />
              )}
            </label>
            <TranslateButton
              from={code}
              to={target}
              getText={() => texts[code] ?? ''}
              onResult={(text) => onChange({ ...texts, [target]: text })}
              labels={labels}
            />
          </div>
        );
      })}
    </fieldset>
  );
}
