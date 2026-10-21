// Content ports: settings, pages, testimonials, contact messages and reviews.
import type { Page } from '@/domain/content/page';
import type { Locale } from '@/domain/shared/locale';
import type { Paginated } from '@/domain/shared/pagination';
import type { SettingsGroup, SettingsMap } from '../content/settings-schemas';

/** Settings persistence. Reads return parsed values with defaults applied. */
export interface SettingsRepository {
  get<G extends SettingsGroup>(group: G): Promise<SettingsMap[G]>;
  save<G extends SettingsGroup>(group: G, value: SettingsMap[G], nowIso: string): Promise<void>;
}

/** Page persistence. */
export interface PageRepository {
  findBySlug(slug: string): Promise<Page | null>;
  findById(id: string): Promise<Page | null>;
  list(): Promise<Page[]>;
  save(page: Page): Promise<void>;
  delete(id: string): Promise<void>;
}

/** A testimonial shown in the testimonials widget. */
export interface Testimonial {
  id: string;
  authorName: string;
  rating: number;
  body: string;
  locale: Locale;
  isVisible: boolean;
  position: number;
  createdAt: string;
}

/** Testimonial persistence. */
export interface TestimonialRepository {
  listVisible(): Promise<Testimonial[]>;
  listAll(): Promise<Testimonial[]>;
  save(testimonial: Testimonial): Promise<void>;
  delete(id: string): Promise<void>;
}

/** A message from the contact form. */
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  locale: Locale;
  isRead: boolean;
  createdAt: string;
}

/** Contact message persistence. */
export interface ContactMessageRepository {
  create(message: ContactMessage): Promise<void>;
  list(page: number, pageSize: number): Promise<Paginated<ContactMessage>>;
  markRead(id: string): Promise<void>;
  countUnread(): Promise<number>;
}

/** Google reviews snapshot (cached in KV, refreshed by a job). */
export interface ReviewsSnapshot {
  rating: number | null;
  ratingCount: number;
  reviews: { author: string; rating: number; text: string; relativeTime: string }[];
  mapsUri: string;
  fetchedAt: string;
}

/** Fetches reviews from Google Places (New). Called only by the reviews job, never by a page. */
export interface ReviewsProvider {
  fetch(placeId: string, locale: Locale): Promise<ReviewsSnapshot | null>;
}
