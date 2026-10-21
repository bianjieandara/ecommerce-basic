// Google reviews. A job fetches the snapshot of every language and keeps it in KV; pages only read KV, so a page view never
// calls Google. Without a Place ID or an API key nothing is fetched and nothing is shown.
import { SUPPORTED_LOCALES, type Locale } from '@/domain/shared/locale';
import type { SettingsRepository, ReviewsProvider, ReviewsSnapshot } from '../ports/content';
import type { CacheStore } from '../ports/platform';

/** KV key of one language's snapshot. */
export function reviewsKey(locale: Locale): string {
  return `reviews:google:${locale}`;
}

/** How long a snapshot stays in KV. The job refreshes it every six hours; the margin covers a missed run. */
const SNAPSHOT_TTL_SECONDS = 12 * 3600;

/** Dependencies of ReviewsService. */
export interface ReviewsServiceDeps {
  provider: ReviewsProvider;
  cache: CacheStore;
  settings: SettingsRepository;
}

/** Fetches Google reviews for the job and reads them for pages. */
export class ReviewsService {
  /** @param deps Provider, cache, settings and clock. */
  constructor(private readonly deps: ReviewsServiceDeps) {}

  /**
   * Job: fetches a snapshot per language and stores it in KV.
   * @returns How many snapshots were stored.
   */
  async refresh(): Promise<{ refreshed: number }> {
    const integrations = await this.deps.settings.get('integrations');
    if (!integrations.googlePlaceId) return { refreshed: 0 };
    let refreshed = 0;
    for (const locale of SUPPORTED_LOCALES) {
      const snapshot = await this.deps.provider.fetch(integrations.googlePlaceId, locale);
      if (!snapshot) continue;
      await this.deps.cache.putJson(reviewsKey(locale), snapshot, SNAPSHOT_TTL_SECONDS);
      refreshed += 1;
    }
    return { refreshed };
  }

  /**
   * The snapshot a page shows: null when the store hides Google reviews or nothing is cached yet.
   * @param locale Page language.
   * @returns The cached snapshot, or null.
   */
  async forPage(locale: Locale): Promise<ReviewsSnapshot | null> {
    const integrations = await this.deps.settings.get('integrations');
    if (!integrations.showGoogleReviews) return null;
    return this.deps.cache.getJson<ReviewsSnapshot>(reviewsKey(locale));
  }
}
