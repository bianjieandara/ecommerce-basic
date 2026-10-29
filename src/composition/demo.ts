// Demo mode wiring. Off unless DEMO_MODE is "on" (only the public demo stores set it). The reset, the locks and the public
// demo details the pages show are built here, so create-container only passes them along.
import { DemoOrderEmails } from '@/application/demo/order-emails';
import { ResetDemo } from '@/application/demo/reset-demo';
import type { OrderRepository } from '@/application/ports/ordering';
import type { NotificationLogRepository } from '@/application/ports/notifications';
import type { CacheStore, Clock, Hasher, PageCacheVersion } from '@/application/ports/platform';
import type { MediaStorage } from '@/application/ports/media';
import { D1DemoRepository } from '@/infrastructure/d1/demo-repository';
import { readSecret } from '@/infrastructure/cloudflare/env';
import { Pbkdf2PasswordHasher } from '@/infrastructure/security/security-adapters';

/** Dependencies of the demo wiring: the shared storage, cache and clock. */
export interface DemoDeps {
  env: Env;
  media: MediaStorage;
  cache: CacheStore;
  pageCache: PageCacheVersion;
  clock: Clock;
  orders: OrderRepository;
  notificationLog: NotificationLogRepository;
  hasher: Hasher;
}

/** What the rest of the app needs to know about demo mode. */
export interface DemoServices {
  /** Whether demo mode is on for this store. */
  enabled: boolean;
  /** Login of the shared demo account, shown on the login page. */
  loginEmail: string;
  loginPassword: string;
  /** Guide page that explains the demo; the storefront and the admin link to it. */
  guideUrl: string;
  /** PayPal sandbox buyer for the checkout hint; empty when the demo has none. */
  paypalBuyerEmail: string;
  paypalBuyerPassword: string;
  resetDemo: ResetDemo;
  /** The e-mails of an order, read back from the outbox (demo only). */
  orderEmails: DemoOrderEmails;
}

/**
 * Builds the demo services from the Worker's configuration.
 * @param deps Storage, cache and clock.
 * @returns The services; `enabled` is false and nothing else matters outside demo mode.
 */
export function createDemo(deps: DemoDeps): DemoServices {
  const enabled = readSecret('DEMO_MODE') === 'on';
  const loginEmail = readSecret('DEMO_LOGIN_EMAIL') ?? '';
  const loginPassword = readSecret('DEMO_LOGIN_PASSWORD') ?? '';
  const resetDemo = new ResetDemo({
    enabled,
    media: deps.media,
    repository: new D1DemoRepository(deps.env.DB),
    cache: deps.cache,
    pageCache: deps.pageCache,
    passwords: new Pbkdf2PasswordHasher(),
    clock: deps.clock,
    account: { email: loginEmail, password: loginPassword, name: 'Demo' },
  });
  return {
    enabled,
    loginEmail,
    loginPassword,
    guideUrl: readSecret('DEMO_GUIDE_URL') ?? '',
    paypalBuyerEmail: readSecret('DEMO_PAYPAL_BUYER_EMAIL') ?? '',
    paypalBuyerPassword: readSecret('DEMO_PAYPAL_BUYER_PASSWORD') ?? '',
    resetDemo,
    orderEmails: new DemoOrderEmails({
      enabled,
      orders: deps.orders,
      notificationLog: deps.notificationLog,
      media: deps.media,
      hasher: deps.hasher,
    }),
  };
}
