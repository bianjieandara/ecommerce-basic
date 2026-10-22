// Every text of the WhatsApp admin screen, translated for the admin's language. The page builds them once and passes them to the
// islands, so the islands never import the dictionary themselves.
import { WHATSAPP_LINKS, WHATSAPP_VARIABLES } from '@/application/notifications/whatsapp/definition';
import { WHATSAPP_KEYS, WHATSAPP_TEMPLATE_STATUSES } from '@/application/ports/whatsapp';
import type { Locale } from '@/domain/shared/locale';
import { t, type DotPath } from '@/ui/i18n';

/** Labels of the WhatsApp admin screen. */
export interface WhatsAppLabels {
  title: string;
  intro: string;
  forbidden: string;
  connection: {
    heading: string;
    configured: string;
    missing: string;
    note: string;
    token: string;
    phoneNumberId: string;
    wabaId: string;
    graphVersion: string;
    appId: string;
    appSecret: string;
    verifyToken: string;
    readyText: string;
    notReadyText: string;
  };
  card: {
    enabled: string;
    metaName: string;
    metaNameHint: string;
    body: string;
    bodyHint: string;
    params: string;
    paramFor: string;
    addParam: string;
    removeParam: string;
    button: string;
    buttonNone: string;
    noButton: string;
    locked: string;
    save: string;
    saving: string;
    submit: string;
    submitting: string;
    sync: string;
    syncing: string;
    test: string;
    testing: string;
    saved: string;
    synced: string;
    testQueued: string;
    reason: string;
    submitResults: string;
    submitted: string;
    alreadyExists: string;
    submitFailed: string;
    audienceCustomer: string;
    audienceStore: string;
    languages: { es: string; en: string };
  };
  statuses: Record<(typeof WHATSAPP_TEMPLATE_STATUSES)[number], string>;
  issues: Record<
    'EMPTY' | 'TOO_LONG' | 'UNKNOWN_PLACEHOLDER' | 'MISSING_PLACEHOLDER' | 'STRAY_BRACES' | 'EDGE_VARIABLE',
    string
  >;
  errors: Record<string, string>;
  keys: Record<(typeof WHATSAPP_KEYS)[number], { label: string; description: string }>;
  variables: Record<(typeof WHATSAPP_VARIABLES)[number], string>;
  links: Record<(typeof WHATSAPP_LINKS)[number], string>;
}

/**
 * Translates one key. The keys are checked by the dictionary build, so a missing one shows as its own path.
 * @param locale Language.
 * @param key Dot path under admin.whatsapp.
 */
function tr(locale: Locale, key: string): string {
  return t(locale, `admin.whatsapp.${key}` as DotPath);
}

/**
 * Builds every label for one language.
 * @param locale The admin's language.
 * @returns The labels.
 */
export function whatsappLabels(locale: Locale): WhatsAppLabels {
  const statuses = Object.fromEntries(
    WHATSAPP_TEMPLATE_STATUSES.map((status) => [status, tr(locale, `statuses.${status}`)]),
  ) as WhatsAppLabels['statuses'];
  const keys = Object.fromEntries(
    WHATSAPP_KEYS.map((key) => [
      key,
      { label: tr(locale, `keys.${key}.label`), description: tr(locale, `keys.${key}.description`) },
    ]),
  ) as WhatsAppLabels['keys'];
  const variables = Object.fromEntries(
    WHATSAPP_VARIABLES.map((path) => [path, tr(locale, `variables.${path}`)]),
  ) as WhatsAppLabels['variables'];
  const links = Object.fromEntries(
    WHATSAPP_LINKS.map((path) => [path, tr(locale, `links.${path}`)]),
  ) as WhatsAppLabels['links'];
  return {
    title: tr(locale, 'title'),
    intro: tr(locale, 'intro'),
    forbidden: t(locale, 'errors.FORBIDDEN'),
    connection: {
      heading: tr(locale, 'connection.heading'),
      configured: tr(locale, 'connection.configured'),
      missing: tr(locale, 'connection.missing'),
      note: tr(locale, 'connection.note'),
      token: tr(locale, 'connection.token'),
      phoneNumberId: tr(locale, 'connection.phoneNumberId'),
      wabaId: tr(locale, 'connection.wabaId'),
      graphVersion: tr(locale, 'connection.graphVersion'),
      appId: tr(locale, 'connection.appId'),
      appSecret: tr(locale, 'connection.appSecret'),
      verifyToken: tr(locale, 'connection.verifyToken'),
      readyText: tr(locale, 'connection.readyText'),
      notReadyText: tr(locale, 'connection.notReadyText'),
    },
    card: {
      enabled: tr(locale, 'card.enabled'),
      metaName: tr(locale, 'card.metaName'),
      metaNameHint: tr(locale, 'card.metaNameHint'),
      body: tr(locale, 'card.body'),
      bodyHint: tr(locale, 'card.bodyHint'),
      params: tr(locale, 'card.params'),
      paramFor: tr(locale, 'card.paramFor'),
      addParam: tr(locale, 'card.addParam'),
      removeParam: tr(locale, 'card.removeParam'),
      button: tr(locale, 'card.button'),
      buttonNone: tr(locale, 'card.buttonNone'),
      noButton: tr(locale, 'card.noButton'),
      locked: tr(locale, 'card.locked'),
      save: tr(locale, 'card.save'),
      saving: tr(locale, 'card.saving'),
      submit: tr(locale, 'card.submit'),
      submitting: tr(locale, 'card.submitting'),
      sync: tr(locale, 'card.sync'),
      syncing: tr(locale, 'card.syncing'),
      test: tr(locale, 'card.test'),
      testing: tr(locale, 'card.testing'),
      saved: tr(locale, 'card.saved'),
      synced: tr(locale, 'card.synced'),
      testQueued: tr(locale, 'card.testQueued'),
      reason: tr(locale, 'card.reason'),
      submitResults: tr(locale, 'card.submitResults'),
      submitted: tr(locale, 'card.submitted'),
      alreadyExists: tr(locale, 'card.alreadyExists'),
      submitFailed: tr(locale, 'card.submitFailed'),
      audienceCustomer: tr(locale, 'audience.customer'),
      audienceStore: tr(locale, 'audience.store'),
      languages: { es: tr(locale, 'languages.es'), en: tr(locale, 'languages.en') },
    },
    statuses,
    issues: {
      EMPTY: tr(locale, 'issues.EMPTY'),
      TOO_LONG: tr(locale, 'issues.TOO_LONG'),
      UNKNOWN_PLACEHOLDER: tr(locale, 'issues.UNKNOWN_PLACEHOLDER'),
      MISSING_PLACEHOLDER: tr(locale, 'issues.MISSING_PLACEHOLDER'),
      STRAY_BRACES: tr(locale, 'issues.STRAY_BRACES'),
      EDGE_VARIABLE: tr(locale, 'issues.EDGE_VARIABLE'),
    },
    errors: {
      NOT_CONNECTED: tr(locale, 'errors.NOT_CONNECTED'),
      NO_PHONE: tr(locale, 'errors.NO_PHONE'),
      APPROVED_READ_ONLY: tr(locale, 'errors.APPROVED_READ_ONLY'),
      NO_BUTTON: tr(locale, 'errors.NO_BUTTON'),
      APP_ID_MISSING: tr(locale, 'errors.APP_ID_MISSING'),
      BODY_INVALID: tr(locale, 'errors.BODY_INVALID'),
      PROVIDER: tr(locale, 'errors.PROVIDER'),
      generic: tr(locale, 'errors.generic'),
    },
    keys,
    variables,
    links,
  };
}
