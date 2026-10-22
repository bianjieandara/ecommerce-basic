// SubscribeBackInStock: a storefront request to hear when an out-of-stock variant is available again. Only out-of-stock
// variants take subscriptions. Repeating a request refreshes it, so the answer never reveals whether an address already signed up.
import { stockStatus } from '@/domain/inventory/stock';
import { DomainError } from '@/domain/shared/errors';
import { normalizePhone } from '@/domain/shared/phone';
import type { SettingsRepository } from '../ports/content';
import type { InventoryRepository } from '../ports/inventory';
import type { BotVerifier, Clock, IdGenerator } from '../ports/platform';
import type { SubscribeInput } from './schemas';

/** Dependencies of SubscribeBackInStock. */
export interface SubscribeBackInStockDeps {
  inventory: InventoryRepository;
  settings: SettingsRepository;
  botVerifier: BotVerifier;
  ids: IdGenerator;
  clock: Clock;
}

/** Stores "notify me when back in stock" requests. */
export class SubscribeBackInStock {
  /** @param deps Repository, settings, bot check, ids and clock. */
  constructor(private readonly deps: SubscribeBackInStockDeps) {}

  /**
   * Stores a subscription for an out-of-stock variant.
   * @param input Validated request.
   * @param client Client IP, used by the bot check.
   * @throws DomainError BOT_CHECK_FAILED, INVALID_STATE (alerts off, or the variant is available), NOT_FOUND,
   * VALIDATION_FAILED (phone number).
   */
  async execute(input: SubscribeInput, client: { ip: string | null }): Promise<void> {
    if (!(await this.deps.botVerifier.verify(input.turnstileToken, client.ip))) {
      throw new DomainError('BOT_CHECK_FAILED', 'The security check failed');
    }
    const [general, inventory, whatsapp] = await Promise.all([
      this.deps.settings.get('general'),
      this.deps.settings.get('inventory'),
      this.deps.settings.get('whatsapp'),
    ]);
    const locale = input.locale ?? general.defaultLocale;
    if (!inventory.backInStockEnabled)
      throw new DomainError('INVALID_STATE', 'Back-in-stock alerts are turned off');
    const [row] = await this.deps.inventory.findVariants(
      [input.variantId],
      locale,
      inventory.defaultLowStockThreshold,
    );
    if (!row?.productActive) throw new DomainError('NOT_FOUND', 'Variant not found');
    if (stockStatus(row.stock, row.threshold, row.tracked) !== 'out') {
      throw new DomainError('INVALID_STATE', 'This variant is available now');
    }
    const phone = input.phone ? normalizePhone(input.phone, whatsapp.defaultCountryCode) : null;
    if (input.phone && phone === null) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid phone number', [
        { path: ['phone'], message: 'Use digits with the country code' },
      ]);
    }
    await this.deps.inventory.addSubscription({
      id: this.deps.ids.newId(),
      variantId: row.variantId,
      email: input.email.toLowerCase(),
      phone,
      locale,
      whatsappOptIn: phone !== null && input.whatsappOptIn,
      createdAt: this.deps.clock.now().toISOString(),
    });
  }
}
