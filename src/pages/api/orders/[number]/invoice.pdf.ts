// Invoice PDF download for the customer who owns the order. The order access key must match; otherwise the answer is 404.
import type { APIRoute } from 'astro';
import { errorResponse } from '@/http/errors';

export const GET: APIRoute = async ({ params, url, locals }) => {
  const number = Number(params.number);
  const key = url.searchParams.get('key') ?? '';
  try {
    const file =
      Number.isInteger(number) && number > 0 ? await locals.app.invoicePdf.execute(number, key) : null;
    if (!file) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
    return new Response(file.bytes, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${file.filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error, locals.requestId);
  }
};
