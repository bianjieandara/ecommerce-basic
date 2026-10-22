// Owner or editor: the invoice as the store's HTML document, for the admin screen, which shows it in a frame.
import { DomainError } from '@/domain/shared/errors';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const GET = defineEndpoint({
  method: 'GET',
  handler: async ({ context }) => {
    const admin = requireAdmin(context.locals.admin);
    const html = await context.locals.app.adminOps.invoiceDocument.execute(admin, context.params.id ?? '');
    if (!html) throw new DomainError('NOT_FOUND', 'Invoice not found');
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  },
});
