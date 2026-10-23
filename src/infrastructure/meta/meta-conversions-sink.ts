// Sends conversions to Meta's Conversions API (POST /{pixelId}/events) through the shared Graph client. Customer data is hashed
// here, with SHA-256 over the normalized value, and is never logged. Temporary failures come back as RetryableError, so the queue
// retries them; rejected events fail once and are listed as failed jobs.
import type { ConversionEvent, ConversionSettings, ConversionsSink } from '@/application/ports/analytics';
import type { Hasher } from '@/application/ports/platform';
import { DomainError } from '@/domain/shared/errors';
import { normalizeEmail } from '@/domain/analytics/identifiers';
import { normalizePhone } from '@/domain/shared/phone';
import { buildConversionBody, type HashedIdentifiers } from './meta-conversion-body';
import type { MetaGraphClient } from './graph-client';

/** Meta pixel ids are numeric. Anything else would change the request path, so it is refused before the request. */
const PIXEL_ID_PATTERN = /^\d{5,20}$/;

/** Sends conversions to the pixel's Conversions API endpoint. */
export class MetaConversionsSink implements ConversionsSink {
  /**
   * @param client Shared Graph client, configured with the Conversions API token.
   * @param hasher SHA-256 used for the customer identifiers.
   * @param siteUrl Public origin, for the event source URL.
   */
  constructor(
    private readonly client: MetaGraphClient,
    private readonly hasher: Hasher,
    private readonly siteUrl: string,
  ) {}

  /** True when the Graph client has its version and token. */
  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  /**
   * Sends one event.
   * @param event Conversion to send.
   * @param settings Pixel id and optional test code.
   * @throws DomainError VALIDATION_FAILED for a malformed pixel id, FORBIDDEN or VALIDATION_FAILED for a rejected request.
   * @throws RetryableError for rate limits, server errors and network failures.
   */
  async send(event: ConversionEvent, settings: ConversionSettings): Promise<void> {
    if (!PIXEL_ID_PATTERN.test(settings.pixelId)) {
      throw new DomainError('VALIDATION_FAILED', 'The Meta pixel id must be numeric.');
    }
    const hashed = await this.hashIdentifiers(event, settings.defaultCountryCode);
    const body = buildConversionBody(event, hashed, this.siteUrl, settings.testEventCode);
    await this.client.postJson(`${settings.pixelId}/events`, body);
  }

  /**
   * Hashes the email and phone of an event. Missing or unusable values are left out, never hashed as empty text.
   * @param event Conversion carrying the raw values (null when there is no consent).
   * @param defaultCountryCode Calling code for phones typed without one.
   * @returns The hashes that exist.
   */
  private async hashIdentifiers(
    event: ConversionEvent,
    defaultCountryCode: string,
  ): Promise<HashedIdentifiers> {
    const email = event.email === null ? null : normalizeEmail(event.email);
    const phone = event.phone === null ? null : normalizePhone(event.phone, defaultCountryCode);
    return {
      ...(email === null ? {} : { em: await this.hasher.sha256Hex(email) }),
      ...(phone === null ? {} : { ph: await this.hasher.sha256Hex(phone) }),
    };
  }
}
