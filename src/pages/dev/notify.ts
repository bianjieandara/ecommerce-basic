// DEV ONLY: queues a sample notification. The queue consumer delivers it with the console transport (EMAIL_TRANSPORT=console
// in .dev.vars), so the whole path (log row, job, delivery, status update) runs locally.
// Optional: ?reference=... (the same reference twice queues one message) and ?to=... (tests the address check).
import type { APIRoute } from 'astro';
import { isLocale } from '@/domain/shared/locale';
import { NOTIFICATION_KEYS, type NotificationKey } from '@/application/ports/notifications';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!import.meta.env.DEV) return new Response('Not found', { status: 404 });
  const key = url.searchParams.get('key') ?? '';
  const locale = url.searchParams.get('locale') ?? 'es';
  if (!(NOTIFICATION_KEYS as readonly string[]).includes(key) || !isLocale(locale)) {
    return Response.json({ ok: false, error: 'Unknown key or locale' }, { status: 400 });
  }
  const result = await locals.app.notifications.notify({
    key: key as NotificationKey,
    reference: url.searchParams.get('reference') ?? crypto.randomUUID(),
    recipient: { email: url.searchParams.get('to') ?? 'dev@example.com', locale },
    context: await locals.app.emailTemplates.sample(locale),
  });
  return Response.json({ ok: true, data: result });
};
