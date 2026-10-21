// Settings shapes used by ports and use cases. Derived from the zod schemas so there is one source of truth.
import type { SettingsMap } from '../content/settings-schemas';

/** General store identity and locale settings. */
export type GeneralSettings = SettingsMap['general'];
/** Contact details and WhatsApp settings. */
export type ContactSettings = SettingsMap['contact'];
/** Payment method and order-hold settings. */
export type CheckoutSettings = SettingsMap['checkout'];
/** Tax settings (included or added, default rate). */
export type TaxSettings = SettingsMap['tax'];
/** Invoicing settings (series, seller data, automation). */
export type InvoicingSettings = SettingsMap['invoicing'];
/** Catalog display settings. */
export type CatalogSettings = SettingsMap['catalog'];
/** Inventory alert settings. */
export type InventorySettings = SettingsMap['inventory'];
