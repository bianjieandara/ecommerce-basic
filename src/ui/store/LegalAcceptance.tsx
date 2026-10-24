// "I accept the privacy policy and the terms" checkbox (Preact island part). Unchecked by default and required, so a
// shopper hands over personal data only after agreeing. Shared by the checkout and the back-in-stock form.
import type { ComponentChild } from 'preact';

/** Translated sentence and the pages it links to. Built on the server by `legalAcceptanceFor`. */
export interface LegalAcceptanceProps {
  /** Sentence with the placeholders {privacy} and {terms}, which become links. */
  text: string;
  privacyLabel: string;
  termsLabel: string;
  privacyHref: string;
  termsHref: string;
}

/** Name of the form field. The forms read it and send it as `acceptedLegal`. */
export const LEGAL_FIELD = 'acceptedLegal';

/**
 * Checkbox with the legal sentence. The links open in a new tab so the shopper does not lose what they typed.
 * @param props Sentence, link texts and link targets.
 */
export function LegalAcceptance(props: LegalAcceptanceProps) {
  const link = (href: string, label: string): ComponentChild => (
    <a href={href} target="_blank" rel="noopener" class="underline">
      {label}
    </a>
  );
  const parts = props.text.split(/(\{privacy\}|\{terms\})/).map((part) => {
    if (part === '{privacy}') return link(props.privacyHref, props.privacyLabel);
    if (part === '{terms}') return link(props.termsHref, props.termsLabel);
    return part;
  });
  return (
    <label class="flex min-h-11 items-start gap-3 text-sm">
      <input type="checkbox" name={LEGAL_FIELD} required class="accent-primary mt-0.5 h-5 w-5 shrink-0" />
      <span>{parts}</span>
    </label>
  );
}
