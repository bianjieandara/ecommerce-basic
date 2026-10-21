// Temporary pass-through so the Stage 1 health route can reach bindings. Removed in Stage 5,
// when routes read services from `Astro.locals.app` instead of the runtime environment.
export { getEnv } from '@/infrastructure/cloudflare/env';
