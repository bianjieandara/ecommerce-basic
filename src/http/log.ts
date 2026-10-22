// Structured logging for the HTTP layer and the pages. The one place pages and routes get logEvent from, so they never
// import an adapter themselves.
export { logEvent } from '@/infrastructure/system/logger';
