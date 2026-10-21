// Google Places (New) reviews. Only the review job calls this; pages read the cached snapshot, never Google.
import type { Locale } from '@/domain/shared/locale';
import { RetryableError } from '@/domain/shared/errors';
import type { ReviewsProvider, ReviewsSnapshot } from '@/application/ports/content';
import { workersFetch } from '../system/http-fetch';

/** The parts of the Places response this adapter reads. */
interface PlaceResponse {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: {
    rating?: number;
    text?: { text?: string };
    relativePublishTimeDescription?: string;
    authorAttribution?: { displayName?: string };
  }[];
}

/** Largest number of reviews kept per language. */
const MAX_REVIEWS = 5;

/** Fetches a place's rating and recent reviews. */
export class GooglePlacesReviews implements ReviewsProvider {
  /**
   * @param apiKey Places API key, or null when not configured (then nothing is fetched).
   * @param fetcher Fetch implementation, injected for tests.
   */
  constructor(
    private readonly apiKey: string | null,
    private readonly fetcher: typeof fetch = workersFetch,
  ) {}

  /**
   * Fetches the snapshot of one place in one language.
   * @param placeId Google Place ID.
   * @param locale Language of the review text.
   * @returns The snapshot, or null when there is no key or the place is unknown.
   * @throws RetryableError for rate limits and server errors.
   */
  async fetch(placeId: string, locale: Locale): Promise<ReviewsSnapshot | null> {
    if (!this.apiKey) return null;
    const response = await this.fetcher(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${locale}`,
      {
        headers: {
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'rating,userRatingCount,reviews,googleMapsUri',
        },
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new RetryableError(`Places API answered ${response.status}`);
    const place = (await response.json()) as PlaceResponse;
    return {
      rating: place.rating ?? null,
      ratingCount: place.userRatingCount ?? 0,
      reviews: (place.reviews ?? []).slice(0, MAX_REVIEWS).map((review) => ({
        author: review.authorAttribution?.displayName ?? '',
        rating: review.rating ?? 0,
        text: review.text?.text ?? '',
        relativeTime: review.relativePublishTimeDescription ?? '',
      })),
      mapsUri: place.googleMapsUri ?? '',
      fetchedAt: new Date().toISOString(),
    };
  }
}
