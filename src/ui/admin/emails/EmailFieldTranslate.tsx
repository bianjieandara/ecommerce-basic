// Translate button under one field of the email editor. It translates the copy on screen into the other language; the editor
// stores the answer in that language's copy. Nothing is saved here.
import type { Locale } from '@/domain/shared/locale';
import TranslateButton from '@/ui/admin/ai/TranslateButton';
import { translateButtonLabels, translateTarget } from '@/ui/admin/ai/translate-ui';

/** Props of the translate button of one email field. */
export interface EmailFieldTranslateProps {
  /** Admin language, in which the button texts are shown. */
  locale: Locale;
  /** Language of the copy on screen. */
  from: Locale;
  field: 'subject' | 'body';
  /** The copy on screen, which is the text translated. */
  text: string;
  /** Receives the translation, with the language it is for. */
  onFill: (field: 'subject' | 'body', text: string, code: Locale) => void;
}

/**
 * The translate button of one email field.
 * @param props Languages, the field, its copy on screen and the handler that stores the translation.
 * @returns The button with its message.
 */
export function EmailFieldTranslate(props: EmailFieldTranslateProps) {
  const { locale, from, field, text, onFill } = props;
  const to = translateTarget(from);
  return (
    <TranslateButton
      from={from}
      to={to}
      getText={() => text}
      onResult={(result) => onFill(field, result, to)}
      labels={translateButtonLabels(locale)}
    />
  );
}
