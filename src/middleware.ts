// Request middleware: attaches the container and a request id to every request.
// Security headers, locale handling and admin auth are added as separate middleware in later stages.
import { defineMiddleware } from 'astro:middleware';
import { createContainer } from '@/composition/create-container';
import { getEnv, getExecutionContext } from '@/infrastructure/cloudflare/env';

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.requestId = crypto.randomUUID();
  context.locals.app = createContainer(getEnv(), getExecutionContext(context.locals));
  return next();
});
