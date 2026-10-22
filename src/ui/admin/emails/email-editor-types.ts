// Props and translated labels of the email editor. The page builds the labels from the dictionary, so the island has no text of its own.
import type { EmailCopy } from '@/application/notifications/render-email';
import type { Locale } from '@/domain/shared/locale';

/** Every text the editor shows. `{email}` in testSent is replaced with the address the test went to. */
export interface EmailEditorLabels {
  subject: string;
  body: string;
  placeholders: string;
  placeholdersHelp: string;
  variables: string;
  blocks: string;
  enabled: string;
  enabledHelp: string;
  save: string;
  saving: string;
  saved: string;
  failed: string;
  invalid: string;
  forbidden: string;
  restore: string;
  restoring: string;
  confirmRestore: string;
  restored: string;
  test: string;
  testing: string;
  testSent: string;
  testFailed: string;
  testHelp: string;
  preview: string;
  previewLoading: string;
  previewFailed: string;
  previewTitle: string;
  customized: string;
  standard: string;
  languages: Record<Locale, string>;
}

/** Props of the editor island, as the page passes them. */
export interface EmailEditorProps {
  /** Notification key; the endpoints live under /api/admin/emails/<key>. */
  emailKey: string;
  /** Language whose tab opens first: the admin's own. */
  locale: Locale;
  /** Variables the copy may use: the store variables plus the email's own. */
  variables: string[];
  /** Blocks the copy may insert with {{block:name}}. */
  blocks: string[];
  /** Copy in use per language: the saved override, or the default. */
  copies: Record<Locale, EmailCopy>;
  /** Code default per language, which Restore default puts back. */
  defaults: Record<Locale, EmailCopy>;
  /** Whether the email is sent. */
  enabled: boolean;
  /** Whether a saved copy exists. */
  customized: boolean;
  /** Display guard only: the save endpoint checks the same permission. */
  canDisable: boolean;
  /** The admin's own address, where the test goes. */
  testAddress: string;
  labels: EmailEditorLabels;
}
