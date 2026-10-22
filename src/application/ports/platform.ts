// Platform ports: time, identifiers, hashing, cache, rate limits, bot checks, email and background work.
// Adapters live in src/infrastructure; use cases only see these interfaces.
import type { Locale } from '@/domain/shared/locale';

/** Current time. Injected so tests and rules can control it. */
export interface Clock {
  now(): Date;
}

/** Generates identifiers and secrets. */
export interface IdGenerator {
  /** New unique id (UUID v4). */
  newId(): string;
  /** Random URL-safe secret (base64url) of the given byte length. */
  newSecret(bytes?: number): string;
}

/** Hashing used for stored secrets (access keys, session tokens, reset tokens). */
export interface Hasher {
  /** SHA-256 of a string as lowercase hex. */
  sha256Hex(value: string): Promise<string>;
}

/** Small key-value cache (KV). Values are JSON. */
export interface CacheStore {
  getJson<T>(key: string): Promise<T | null>;
  putJson(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Version string that changes whenever content changes, used to invalidate the page cache. */
export interface PageCacheVersion {
  current(): Promise<string>;
  bump(): Promise<void>;
}

/** Verifies a Turnstile token. Failing open is never allowed. */
export interface BotVerifier {
  verify(token: string | null, ip: string | null): Promise<boolean>;
}

/** Rate-limit buckets. Each maps to one binding in wrangler.base.jsonc. */
export type RateLimitBucket = 'auth' | 'forms' | 'api';

/** Rate limiter keyed by bucket and client key (IP, email, ...). */
export interface RateLimiter {
  allow(bucket: RateLimitBucket, key: string): Promise<boolean>;
}

/** An attachment sent with an email. */
export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: ArrayBuffer;
}

/** Sends one transactional email. */
export interface EmailSender {
  send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
    attachments?: EmailAttachment[];
  }): Promise<{ messageId: string }>;
}

/** Runs work that may outlive the response (ctx.waitUntil when available). */
export interface BackgroundTasks {
  run(task: Promise<unknown>): void;
}

/** Store locale codes, re-exported so ports do not need the domain import path. */
export type { Locale };

/** Writes one structured log line. Use cases that must not fail a request log through it; the adapter is logEvent. */
export type LogEvent = (event: string, data?: Record<string, unknown>) => void;
