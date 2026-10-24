// One e-mail of an order, as the demo store kept it in its outbox. The order's access key must match; otherwise the answer is 404.
// The page is served with a sandbox policy: the e-mail shows, but it runs no script and cannot submit a form.
import type { APIRoute } from 'astro';
import { errorResponse } from '@/http/errors';

const NO_STORE = { 'cache-control': 'no-store' };

export const GET: APIRoute = async ({ params, url, locals }) => {
  const number = Number(params.number);
  const key = url.searchParams.get('key') ?? '';
  try {
    const html =
      Number.isInteger(number) && number > 0 && params.id
        ? await locals.app.demo.orderEmails.html(number, key, params.id)
        : null;
    if (html === null) return new Response('Not found', { status: 404, headers: NO_STORE });
    return new Response(html, {
      headers: {
        ...NO_STORE,
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy':
          "sandbox; default-src 'none'; img-src https: data:; style-src 'unsafe-inline'",
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return errorResponse(error, locals.requestId);
  }
};
