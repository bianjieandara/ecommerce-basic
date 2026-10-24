// Builds the props of the legal acceptance checkbox from the dictionary and the route table, so every page that asks
// for personal data passes the same text and links.
import type { Locale } from '@/domain/shared/locale';
import { t } from '@/ui/i18n';
import type { LegalAcceptanceProps } from '@/ui/store/LegalAcceptance';
import { routes } from './routes';

/**
 * Props for the "I accept the privacy policy and the terms" checkbox.
 * @param locale Language of the page.
 * @returns Sentence, link texts and the privacy and terms page paths.
 */
export function legalAcceptanceFor(locale: Locale): LegalAcceptanceProps {
  return {
    text: t(locale, 'legal.accept'),
    privacyLabel: t(locale, 'legal.privacyLink'),
    termsLabel: t(locale, 'legal.termsLink'),
    privacyHref: routes.page(locale, 'privacy'),
    termsHref: routes.page(locale, 'terms'),
  };
}
