// WhatsApp ports: the stored template config, the Meta Cloud API sender and template catalog, the webhook checks and the
// delivery status updates. Adapters for Meta live in src/infrastructure/meta; use cases only see these interfaces.
import type { Locale } from '@/domain/shared/locale';
import type { LocalizedText } from '@/domain/shared/localized-text';
import type { NotificationKey } from './notifications';

/** The messages WhatsApp can carry: customer updates and store alerts. Each one has a code definition and a template row. */
export const WHATSAPP_KEYS = [
  'order_received',
  'payment_confirmed',
  'order_shipped',
  'order_delivered',
  'order_cancelled',
  'invoice_issued',
  'back_in_stock',
  'order_alert_store',
  'low_stock_store',
  'weekly_report_store',
] as const satisfies readonly NotificationKey[];

/** One WhatsApp message key. */
export type WhatsAppKey = (typeof WHATSAPP_KEYS)[number];

/**
 * Status of one template in one language. NOT_SUBMITTED means Meta has no template with that name yet. Only APPROVED may be
 * sent; the others are kept so the admin sees why a message is skipped.
 */
export const WHATSAPP_TEMPLATE_STATUSES = [
  'NOT_SUBMITTED',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'PAUSED',
  'DISABLED',
] as const;

/** One template status. */
export type WhatsAppTemplateStatus = (typeof WHATSAPP_TEMPLATE_STATUSES)[number];

/**
 * Maps Meta's status string to ours. Statuses that Meta may move back to approved (appeals, pending deletion) count as
 * pending; every status that cannot be sent is disabled.
 * @param metaStatus Status as Meta reports it, for example "APPROVED".
 * @returns The status the store keeps.
 */
export function templateStatusFrom(metaStatus: string): WhatsAppTemplateStatus {
  switch (metaStatus) {
    case 'APPROVED':
      return 'APPROVED';
    case 'PENDING':
    case 'IN_APPEAL':
    case 'PENDING_DELETION':
      return 'PENDING';
    case 'REJECTED':
      return 'REJECTED';
    case 'PAUSED':
      return 'PAUSED';
    default:
      return 'DISABLED';
  }
}

/** Status of one template in one language, as last synced from Meta. */
export interface WhatsAppLanguageStatus {
  status: WhatsAppTemplateStatus;
  /** Meta's reason for a rejection, or the error of the last submit. */
  reason: string | null;
  syncedAt: string | null;
}

/** Per-language status of a template. A language missing here has never been synced. */
export type WhatsAppRemoteStatus = Partial<Record<Locale, WhatsAppLanguageStatus>>;

/** The stored config of one WhatsApp message (a row of whatsapp_templates). */
export interface WhatsAppTemplateConfig {
  key: WhatsAppKey;
  /** Name of the Meta template. Shared by both languages; changing it starts a new template in Meta. */
  metaName: string;
  enabled: boolean;
  /** Body per language, with {{1}}..{{n}} for the parameters. */
  body: LocalizedText;
  /** Notification context paths; params[i] fills {{i+1}}. */
  params: string[];
  /** Notification context path of the URL button, or null when the message has no button. */
  buttonPath: string | null;
  /** Whether the message has a PDF header (invoice). */
  headerDocument: boolean;
  remoteStatus: WhatsAppRemoteStatus;
  updatedAt: string;
}

/** Persistence for the WhatsApp template configs. */
export interface WhatsAppTemplateRepository {
  find(key: WhatsAppKey): Promise<WhatsAppTemplateConfig | null>;
  list(): Promise<WhatsAppTemplateConfig[]>;
  /** Inserts the defaults of the keys that have no row yet. Existing rows are left alone. */
  seedMissing(defaults: WhatsAppTemplateConfig[]): Promise<void>;
  /** Writes the config and returns the row as stored. */
  save(config: WhatsAppTemplateConfig): Promise<WhatsAppTemplateConfig>;
  /** Writes the per-language status and returns it as stored. */
  saveRemoteStatus(key: WhatsAppKey, remoteStatus: WhatsAppRemoteStatus): Promise<WhatsAppRemoteStatus>;
}

/** One delivery status from Meta's webhook, for a message we sent. */
export interface WhatsAppStatusUpdate {
  providerMessageId: string;
  status: 'delivered' | 'read' | 'failed';
  error: string | null;
}

/** Applies delivery statuses to the notification log, only ever moving a message forward. */
export interface WhatsAppStatusRepository {
  /**
   * @returns How many log rows changed.
   */
  applyStatuses(updates: WhatsAppStatusUpdate[], nowIso: string): Promise<number>;
}

/** A file to upload to WhatsApp before it is sent as a document header. */
export interface WhatsAppMedia {
  filename: string;
  contentType: string;
  content: ArrayBuffer;
}

/** One template message, ready for the Cloud API. Parameters are already text and in the template's order. */
export interface WhatsAppTemplateMessage {
  /** Digits with country code, no "+". */
  to: string;
  templateName: string;
  /** Meta language code of the template, for example "es" or "en". */
  languageCode: string;
  bodyParams: string[];
  /** Text that replaces {{1}} in the URL button, or null when the template has no button. */
  buttonSuffix: string | null;
  /** The uploaded document, for templates with a document header. */
  document: { mediaId: string; filename: string } | null;
}

/** Sends WhatsApp messages. `isConfigured` is false until the Meta connection settings are set. */
export interface WhatsAppSender {
  isConfigured(): boolean;
  uploadMedia(file: WhatsAppMedia): Promise<{ mediaId: string }>;
  /** @returns The WhatsApp message id, which the webhook uses for status updates. */
  sendTemplate(message: WhatsAppTemplateMessage): Promise<{ messageId: string }>;
}

/** One template as Meta reports it, for one language. */
export interface MetaTemplateRecord {
  languageCode: string;
  status: string;
  reason: string | null;
}

/** A template to create in Meta, in one language. Examples are required by Meta for every variable. */
export interface MetaTemplateDraft {
  name: string;
  languageCode: string;
  bodyText: string;
  bodyExamples: string[];
  /** URL button: the base URL ends with "/", and the example is one full URL. */
  button: { label: string; baseUrl: string; example: string } | null;
  /** Whether the template has a PDF header. The adapter uploads a sample for the example. */
  documentHeader: boolean;
}

/** Template operations of the WhatsApp Business Account. */
export interface WhatsAppTemplateCatalog {
  isConfigured(): boolean;
  /** Every template with this name, one per language. Empty when none exists. */
  findByName(name: string): Promise<MetaTemplateRecord[]>;
  /** @returns The id and status Meta gave the new template (usually PENDING). */
  create(draft: MetaTemplateDraft): Promise<{ id: string; status: string }>;
}

/** Checks the webhook subscription and the signature of each delivery. Never returns true when a secret is missing. */
export interface WhatsAppWebhookAuth {
  verifySubscriptionToken(token: string | null): boolean;
  verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean>;
}

/** Which Meta settings are set. Values are never returned, only whether they exist. */
export interface WhatsAppConnectionStatus {
  tokenConfigured: boolean;
  phoneNumberIdConfigured: boolean;
  wabaIdConfigured: boolean;
  graphVersionConfigured: boolean;
  appIdConfigured: boolean;
  appSecretConfigured: boolean;
  verifyTokenConfigured: boolean;
}

/** Reads the connection status for the admin screen. */
export interface WhatsAppConnection {
  status(): WhatsAppConnectionStatus;
}
