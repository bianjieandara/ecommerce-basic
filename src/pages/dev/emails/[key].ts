// DEV ONLY: renders one notification email with sample data. Add ?locale=en for English. Add ?subject=...&body=... to
// preview a draft; a draft with unknown placeholders answers 422 with the problems, the same check the editor runs on save.
import type { APIRoute } from 'astro';
import { DomainError } from '@/domain/shared/errors';
import { isLocale } from '@/domain/shared/locale';
import { NOTIFICATION_KEYS, type NotificationKey } from '@/application/ports/notifications';

export const GET: APIRoute = async ({ params, url, locals }) => {
  if (!import.meta.env.DEV) return new Response('Not found', { status: 404 });
  const key = params.key ?? '';
  const locale = url.searchParams.get('locale') ?? 'es';
  if (!(NOTIFICATION_KEYS as readonly string[]).includes(key) || !isLocale(locale)) {
    return new Response('Not found', { status: 404 });
  }
  const draft = url.searchParams.has('body')
    ? { subject: url.searchParams.get('subject') ?? '', body: url.searchParams.get('body') ?? '' }
    : undefined;
  try {
    const email = await locals.app.emailTemplates.preview(key as NotificationKey, locale, draft);
    return new Response(email.html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-email-subject': encodeURIComponent(email.subject),
      },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return Response.json({ ok: false, error: error.code, details: error.details }, { status: 422 });
    }
    throw error;
  }
};
