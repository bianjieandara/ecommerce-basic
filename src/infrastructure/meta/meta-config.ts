// Reads the Meta settings from the Worker environment and reports which of them are set. Values stay here: the admin screen gets
// flags, never the ids or tokens themselves.
import { readSecret } from '@/infrastructure/cloudflare/env';
import type { WhatsAppConnectionStatus } from '@/application/ports/whatsapp';
import type { GraphConfig } from './graph-client';

/** Every Meta setting the WhatsApp adapters use. A null value means the setting is not set. */
export interface MetaSettings {
  graphVersion: string | null;
  token: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  appId: string | null;
  appSecret: string | null;
  verifyToken: string | null;
}

/**
 * Reads the Meta settings. Empty strings count as unset.
 * @returns The settings, each one a value or null.
 */
export function readMetaSettings(): MetaSettings {
  return {
    graphVersion: readSecret('META_GRAPH_VERSION'),
    token: readSecret('WHATSAPP_TOKEN'),
    phoneNumberId: readSecret('WHATSAPP_PHONE_NUMBER_ID'),
    wabaId: readSecret('WHATSAPP_WABA_ID'),
    appId: readSecret('META_APP_ID'),
    appSecret: readSecret('META_APP_SECRET'),
    verifyToken: readSecret('WHATSAPP_VERIFY_TOKEN'),
  };
}

/**
 * Which settings are set, for the connection panel.
 * @param settings Settings from readMetaSettings.
 * @returns Flags only.
 */
export function connectionStatusOf(settings: MetaSettings): WhatsAppConnectionStatus {
  return {
    tokenConfigured: settings.token !== null,
    phoneNumberIdConfigured: settings.phoneNumberId !== null,
    wabaIdConfigured: settings.wabaId !== null,
    graphVersionConfigured: settings.graphVersion !== null,
    appIdConfigured: settings.appId !== null,
    appSecretConfigured: settings.appSecret !== null,
    verifyTokenConfigured: settings.verifyToken !== null,
  };
}

/**
 * Connection settings of the Conversions API: the Graph version is shared with WhatsApp, the token is its own
 * (META_CAPI_TOKEN) so the two can be revoked separately.
 * @returns Version and token, each null when unset.
 */
export function readCapiSettings(): GraphConfig {
  return {
    version: readSecret('META_GRAPH_VERSION'),
    token: readSecret('META_CAPI_TOKEN'),
    baseUrl: readSecret('META_GRAPH_BASE_URL'),
  };
}
